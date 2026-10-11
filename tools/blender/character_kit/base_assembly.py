"""베이스 조립(여성): HBM 몸·머리를 키트 베이스 GLB의 메시들로 만든다 (bpy + numpy).

이 모듈이 하는 일
-----------------
1. `load_context` — HBM npz를 읽고 68 joint 리그·스킨 웨이트·A→T 포즈 변환(+어깨·겨드랑이 돌기 완화 `relax_arm_transition`)·머리 정합·체형 필드를 한 번에 준비한다.
2. `build_split_mesh`·`assign_face_regions`·`region_ranges` — 몸/머리 분할, 영역(`_REGION`·`bodyRegions`), UV 전개, 정점 배열.
3. morph 델타(`body_world_delta`·`face_world_delta`·`compute_head_deltas`·`scoped_deltas`·`eye_deltas`·`attach_head_deltas`) — 체형 18(±)·얼굴 30(±)·FACS 16이
   모든 메시에서 계약 `KIT_MORPH_COVERAGE`를 채운다. 델타는 용접 정점에서 한 번 계산해 이음매 정점에 똑같이 나눠 준다. 입 벌림 가중치(`jaw_weights`)와
   눈 깜빡임·크게 뜨기·가늘게 뜨기(`eyes_mouth.blink_delta`·`wide_delta`·`squint_delta`)와 눈썹 3종의 눈 보호(`eye_protection_weight`)는 TS 필드가 HBM 머리에서
   찢어지거나(입꼬리 지느러미, 정중선 주름) 눈구멍 전체가 안구에서 떠나(빈 눈구멍) HBM 머리에 맞춰 다시 짰다.
4. 속옷 셸(`underwear_shell`: 보이시 쇼츠 + 밴도 브라, 몸에서 2 mm 바깥), `eyes_mouth`의 눈·입 안(치아·혀)·속눈썹·눈썹, 피부 텍스처
   (`skin_face_colors`→`encode_skin_texture`)를 합쳐 `build_base`가 `MeshNode` 9개와 재질을 만든다.
5. `write_base_glb` 로 키트 계약대로 GLB를 쓰고(morph는 `QuantizedGlbWriter`가 정규화 SHORT + sparse로 써 12 MiB 안팎), `export_base_model`/`load_base_model` 로
   리타깃용 npz를 주고받는다.

검증기 V9가 모든 `param:*` 타깃에 최대 델타 ≥ 1e-5 m와 `+` ≠ `−`를 요구하는데 몇몇 필드는 멀리 있는 메시에서 정확히 0이다(눈·눈썹 위치의 `faceShape`, 속옷·홍채의
`headSize`/`neckLength`, 발의 어깨·가슴·허리·엉덩이·팔 길이 등). 그 자리에는 `ensure_min_delta`가 0.03 mm 바닥 델타(정점 하나, 좌우 방향, ±는 부호 반대)를 더하고 어디에 더했는지
`report["floorsApplied"]`에 남긴다. 리타깃도 같은 규칙이 필요하다(실제 발·신발에서 확인됨).

좌표·규약
---------
glTF 좌표(Y 위, +Z 앞, 캐릭터 왼쪽 +X, 미터). 레스트는 T-포즈. 모든 메시는 스킨이며 joint 이름 배열은 계약 `skeleton.joints` 순서다.
삼각형은 쿼드마다 연속 2개(`quads_to_triangles`)이고 반시계 감김이 바깥이다.

리타깃 인터페이스: `base_model_<base>.npz` (`export_base_model`로 쓰고 `load_base_model`로 읽는다)
------------------------------------------------------------------------------------------
의상·헤어 리타깃은 "A-포즈 몸에 의상을 맞추고 → 몸 표면에 결합 → T-포즈 몸과 모든 morph로 평가"한다. 그러려면 최종 GLB의 정점 순서와 같은
순서의 배열이 필요하므로 베이스를 쓸 때 아래를 함께 낸다. 메시 접두 `body_`(TS_Body), `head_`(TS_Head); N은 그 메시의 정점 수(UV 분할 뒤), T는 삼각형 수.

  <접두>apose_positions  (N,3) float64  리그 전 HBM A-포즈 위치. UV로 나뉜 복제 정점은 같은 위치를 가진다.
  <접두>tpose_positions  (N,3) float64  GLB의 T-포즈 레스트 위치(= GLB POSITION).
  <접두>triangles        (T,3) int64    GLB 인덱스 버퍼와 같은 순서. 몸은 영역 순서로 정렬돼 있다.
  <접두>uv               (N,2) float32  GLB TEXCOORD_0.
  <접두>normals          (N,3) float32  GLB NORMAL(T-포즈, 몸/머리 이음매에서 같은 값).
  <접두>region           (N,)  uint8    정점 `_REGION`(값은 `region_ids` 인덱스).
  <접두>joints           (N,4) uint8    JOINTS_0(`joint_names` 인덱스, 가중치 0인 슬롯은 0).
  <접두>weights          (N,4) float32  WEIGHTS_0(합 1).
  <접두>origin           (N,)  int64    용접 정점 번호(HBM 몸 정점 번호). 같은 번호끼리 같은 점이다.
  <접두>morph_names      (M,)  str      이 메시의 morph 이름(계약 이름 그대로, `param:<키>:±`, `facs:<유닛>`).
  <접두>morph_delta      (M,N,3) float32 위치 델타(m). 순서는 morph_names.
  <접두>morph_normal_delta (M,N,3) float32 법선 델타.
  body_triangle_region   (T,) uint8     몸 삼각형의 영역 번호.
  region_ids             (16,) str      계약 `KIT_REGION_IDS` 순서.
  body_regions           (15,3) int64   (영역 번호, indexStart, indexCount) — kit.json `bodyRegions`와 같다(index는 삼각형 인덱스 3배수).
  joint_names            (68,) str      계약 joint 순서. joint_parents (68,) int(-1 = 루트). joint_tpose/joint_apose (68,3).
  joint_offsets_json     ()  str        kit.json `jointOffsets`(체형 morph의 관절 이동, 부모 로컬 평행이동에 더하는 양).
  extra_mesh_names       (K,) str       그 밖의 메시 노드(눈·입·속눈썹·눈썹·속옷). 각 메시는 `mesh/<노드>/…` 키로 같은 배열(apose 제외)을 가진다.

`load_base_model(path)`는 이 배열을 `BaseModel`(dataclass)로 돌려준다. 파츠가 morph를 따라가는지는 검증기 V9와 같은 척도로
`follow_deviation(...)`이 잰다(`kit_manifest` 모듈 설명 참조).

몸 가림(`hides`) 규약: `body_regions`의 영역 id(`hideable_region_ids` 15개)만 숨길 수 있고 그 영역을 전부 덮을 때만 선언한다.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from . import contract as contract_mod
from . import face_fields as ff
from . import base_textures as bt
from . import fields_body, fields_face, glbwriter, hbm, landmarks, skin, uvtools
from . import rig as rigmod
from .surface import Surface, triangle_normals, vertex_normals

BODY_NODE = "TS_Body"
HEAD_NODE = "TS_Head"
REGION_HEAD = "head"
#: 머리 메시가 따라가야 하는 체형 키(계약 `KIT_HEAD_ATTACHED_BODY_KEYS`) — 계약 덤프 coverage에서 다시 읽어 검사한다.
HEAD_ATTACHED_BODY_KEYS = ("height", "legLength", "neckLength", "headSize")
#: 이음매에서 몸 델타가 0이 아니라서 머리에도 같은 타깃을 두어야 목이 벌어지지 않는 체형 키 후보(실측해서 고른다).
HEAD_SEAM_BODY_KEYS = ("shoulderWidth", "chestDepth", "armLength", "waist", "hip")
#: 이음매 틈이 이 값(m)을 넘으면 머리에도 그 체형 타깃을 둔다.
SEAM_GAP_LIMIT_M = 2e-4
#: morph 델타 꼬리 정리: |델타|가 FADE_LO 이하는 0, FADE_HI 이상은 그대로, 사이는 부드럽게(m). 0.2~0.6 mm 아래의 가우시안 꼬리를 잘라 sparse accessor가 먹히게 한다
#: (눈에 보이지 않는 크기이고 모든 메시·이음매에 같은 함수를 쓰므로 일관성은 유지된다).
FADE_LO = 2e-4
FADE_HI = 6e-4
#: 법선 델타 꼬리 정리(단위 법선의 변화량): 3° 안팎 이하의 변화는 버린다. 툰 램프에서 보이지 않는 크기다.
NORMAL_FADE_LO = 0.05
NORMAL_FADE_HI = 0.12
#: 눈·눈썹처럼 필드가 해당 영역에서 정확히 0인 `param:*` morph에 더하는 바닥(m). 검증기 V9가 최대 델타 ≥ 1e-5 m를 요구한다.
MIN_PARAM_DELTA_M = 3.0e-5


# ---------------------------------------------------------------- 자료 구조


@dataclass
class Prim:
    """GLB 프리미티브 하나. 정점 순서가 곧 GLB 정점 순서다."""

    material: str
    positions: np.ndarray  # (N,3) float64, T-포즈 레스트
    triangles: np.ndarray  # (T,3) int64
    normals: np.ndarray  # (N,3)
    uv: np.ndarray  # (N,2) float32
    joints: np.ndarray  # (N,4) uint8
    weights: np.ndarray  # (N,4) float32
    region: np.ndarray | None = None  # (N,) uint8
    morphs: dict[str, np.ndarray] = field(default_factory=dict)  # 이름 → (N,3) float32 위치 델타
    morph_normals: dict[str, np.ndarray] = field(default_factory=dict)  # 이름 → (N,3) float32 법선 델타(TS_Head·TS_Body만)
    origin: np.ndarray | None = None  # (N,) 용접 정점 번호(몸/머리)
    apose: np.ndarray | None = None  # (N,3) A-포즈 위치(몸/머리)


@dataclass
class MeshNode:
    name: str
    roles: list[str]
    prims: list[Prim]


@dataclass
class MaterialSpec:
    name: str
    role: str
    texture: bytes | None
    mime: str | None
    alpha_mode: str = "OPAQUE"
    alpha_cutoff: float | None = None
    double_sided: bool = False


@dataclass
class Context:
    """한 번 준비해 빌더들이 공유하는 입력: HBM 몸, 리그, 스킨, T-포즈, 정합, 체형 필드."""

    contract: contract_mod.Contract
    body: hbm.Body
    names: list[str]
    rig: rigmod.Rig
    head_mask: np.ndarray  # (F,) bool 머리 면
    skin_idx: np.ndarray  # (V,4) uint8
    skin_val: np.ndarray  # (V,4) float32
    t_pos: np.ndarray  # (V,3) T-포즈 위치
    quads: np.ndarray  # (F,4)
    normals: np.ndarray  # (V,3) 용접 메시 법선(T-포즈)
    seam: np.ndarray  # 머리와 몸이 공유하는 정점 번호
    frame: fields_face.HeadFrame
    fields: fields_body.BodyFields
    timings: dict[str, float] = field(default_factory=dict)
    #: "female" | "male". 남성 베이스는 속옷에 브라가 없고 머리를 여성 좌표계로 내려 만든다(`y_shift`).
    base_id: str = "female"
    #: 머리 높이를 여성 HBM 좌표 상수(입·눈·턱·치아·관절 위치가 절대 좌표다)에 맞추려고 `load_context`가 몸 전체를 아래로 내린 양(m). 빌드 끝에 `unshift_build`로 되돌린다.
    y_shift: float = 0.0

    @property
    def joint_index(self) -> dict[str, int]:
        return {name: i for i, name in enumerate(self.names)}


@dataclass
class BaseBuild:
    """`build_base`의 결과: GLB로 쓸 메시·재질과 사이드카·리타깃 npz에 필요한 모든 것."""

    ctx: Context
    meshes: list[MeshNode]
    materials: dict[str, MaterialSpec]
    body_regions: list[dict[str, Any]]
    body_triangle_region: np.ndarray
    joint_offsets: dict[str, dict[str, list[float]]]
    report: dict[str, Any]


# ---------------------------------------------------------------- 작은 수학 도구


def smoothstep01(lo: float, hi: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def fade_small(delta: np.ndarray, lo: float | None = None, hi: float | None = None) -> np.ndarray:
    """|델타|가 아주 작은 꼬리를 부드럽게 0으로 만든다(sparse accessor가 먹히고 가우시안 꼬리가 파일을 키우지 않게)."""
    magnitude = np.linalg.norm(delta, axis=1, keepdims=True)
    return delta * smoothstep01(FADE_LO if lo is None else lo, FADE_HI if hi is None else hi, magnitude)


def quads_to_triangles(positions: np.ndarray, quads: np.ndarray) -> np.ndarray:
    """쿼드마다 삼각형 2개를 연속으로 만든다. 더 짧은 대각선을 고른다(가는 조각 삼각형을 줄인다)."""
    d02 = np.linalg.norm(positions[quads[:, 0]] - positions[quads[:, 2]], axis=1)
    d13 = np.linalg.norm(positions[quads[:, 1]] - positions[quads[:, 3]], axis=1)
    use13 = d13 < d02
    out = np.empty((len(quads) * 2, 3), dtype=np.int64)
    first = np.where(use13[:, None], quads[:, [0, 1, 3]], quads[:, [0, 1, 2]])
    second = np.where(use13[:, None], quads[:, [1, 2, 3]], quads[:, [0, 2, 3]])
    out[0::2] = first
    out[1::2] = second
    return out


def welded_normals(positions: np.ndarray, quads: np.ndarray) -> np.ndarray:
    """용접된 쿼드 메시의 면적 가중 정점 법선(두 삼각형으로 나눠 계산)."""
    tris = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]], axis=0)
    return vertex_normals(positions, tris)


def dense_weights(indices: np.ndarray, values: np.ndarray, joint_count: int) -> np.ndarray:
    """상위 4개 (V,4) 표현을 (V,J) 조밀 행렬로 펼친다."""
    dense = np.zeros((len(indices), joint_count), dtype=np.float32)
    for k in range(indices.shape[1]):
        np.add.at(dense, (np.arange(len(indices)), indices[:, k].astype(np.int64)), values[:, k])
    return dense


def top4(dense: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return skin.top_influences(dense)


def interpolate_skin(ctx: Context, surface: Surface, surface_vertex_ids: np.ndarray, points: np.ndarray, max_distance: float | None = None) -> tuple[np.ndarray, np.ndarray]:
    """`surface`(몸/머리의 삼각형 표면, 정점 번호는 `surface_vertex_ids`가 용접 번호로 바꿔 준다) 위 최근접점의 무게중심으로 스킨 웨이트를 보간한다."""
    hits = surface.closest(points, max_distance=max_distance)
    if (hits.triangle < 0).any():
        raise RuntimeError("스킨 보간: 표면에서 최근접점을 찾지 못한 정점이 있습니다.")
    corners = surface.triangles[hits.triangle]  # (M,3) 표면 로컬 번호
    welded = surface_vertex_ids[corners]  # (M,3) 용접 번호
    joint_count = len(ctx.names)
    dense = np.zeros((len(points), joint_count), dtype=np.float64)
    for c in range(3):
        weights = hits.bary[:, c : c + 1]
        for k in range(ctx.skin_idx.shape[1]):
            np.add.at(dense, (np.arange(len(points)), ctx.skin_idx[welded[:, c], k].astype(np.int64)), weights[:, 0] * ctx.skin_val[welded[:, c], k])
    return top4(dense.astype(np.float32))


# ---------------------------------------------------------------- 컨텍스트


def refit_head_frame_y(body: hbm.Body, frame: fields_face.HeadFrame) -> fields_face.HeadFrame:
    """`fit_head_frame` 결과에서 y축(높이)만 다시 맞춘다.

    기본 정합은 귀·턱 모서리(해부 지표 오차가 큼)까지 y 최소제곱에 넣어 입선이 HBM 입술 접촉선보다 3.6 mm 높게 나온다. 얼굴 필드의
    턱 마스크(`jawOpen`)는 입선을 기준으로 위아래 입술을 가르므로 입선이 어긋나면 윗입술 아래쪽이 턱을 따라 끌려 내려간다.
    그래서 y는 눈 중심·코끝·입 선(가중 4)·턱끝·이마만으로 다시 맞춘다(입선 잔차 0.8 mm). x·z는 기본 정합을 그대로 쓴다.
    """
    p = body.positions
    local = ff.HEAD_LANDMARKS
    nose_pool = np.flatnonzero((np.abs(p[:, 0]) < 0.004) & (p[:, 1] > 1.47) & (p[:, 1] < 1.53) & (p[:, 2] > 0.1))
    nose_tip = p[nose_pool[np.argmax(p[nose_pool, 2])]]
    forehead_pool = np.flatnonzero((np.abs(p[:, 0]) < 0.003) & (np.abs(p[:, 1] - 1.59) < 0.004) & (p[:, 2] > 0.0))
    forehead = p[forehead_pool[np.argmax(p[forehead_pool, 2])]]
    eye = body.eyes["L"][0].mean(axis=0)
    pairs = [
        (eye[1], local["eye"][1], 2.0),
        (nose_tip[1], local["noseTip"][1], 1.0),
        (1.4645, local["mouth"][1], 4.0),
        (1.4118, local["chin"][1], 1.0),
        (forehead[1], local["forehead"][1], 0.7),
    ]
    design = np.array([[loc, 1.0] for _, loc, _ in pairs]) * np.array([w for *_, w in pairs])[:, None]
    target = np.array([world for world, _, _ in pairs]) * np.array([w for *_, w in pairs])
    (scale_y, origin_y), *_ = np.linalg.lstsq(design, target, rcond=None)
    origin = frame.origin.copy()
    scale = frame.scale.copy()
    origin[1], scale[1] = origin_y, scale_y
    residual = dict(frame.residual_mm)
    residual["mouth_y_refit"] = float(abs(scale_y * local["mouth"][1] + origin_y - 1.4645) * 1000.0)
    return fields_face.HeadFrame(origin=origin, scale=scale, residual_mm=residual)


def laplacian_magnitude(positions: np.ndarray, ptr: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """균일 라플라시안의 크기(이웃 평균과 정점의 거리, m) — 돌기·주름 지표."""
    degree = np.diff(ptr)
    src = np.repeat(np.arange(len(positions)), degree)
    sums = np.zeros_like(positions)
    np.add.at(sums, src, positions[idx])
    return np.linalg.norm(sums / degree[:, None] - positions, axis=1)


def relax_arm_transition(
    t_pos: np.ndarray,
    a_pos: np.ndarray,
    rig: rigmod.Rig,
    ptr: np.ndarray,
    idx: np.ndarray,
    protected: np.ndarray,
    excess_threshold: float = 0.0012,
    rings: int = 3,
    iterations: int = 50,
    zone_radius: float = 0.24,
) -> np.ndarray:
    """A→T 변환으로 어깨·겨드랑이 주위에 생긴 돌기(이웃 평균에서 벗어난 정도가 A-포즈보다 `excess_threshold` 넘게 커진 정점)를 Taubin 평활로 푼다.

    DQS가 팔 쪽 정점만 90° 돌리고 몸통 쪽은 가중치 1이라 ARAP 자유 영역(섞인 정점)에서 빠지므로 팔 밑 몸통 옆면에 최대 16 mm의 주름 돌기가 남는다
    (브라 셸을 뚫고 나오는 원인이기도 했다). 머리 면의 정점은 건드리지 않는다. 그 위에 어깨 윗선(목과 어깨 마루 사이의 단차)을 약하게 한 번 더 푼다(최대 약 3 mm)."""
    pivots = np.stack([rig.a_pose[rig.index(f"{rigmod.MIXAMO}{side}Arm")] for side in ("Left", "Right")])
    near = np.linalg.norm(a_pos[:, None, :] - pivots[None], axis=2).min(axis=1) < zone_radius
    movable = near.copy()
    movable[protected] = False
    excess = laplacian_magnitude(t_pos, ptr, idx) - laplacian_magnitude(a_pos, ptr, idx)
    seeds = np.flatnonzero(movable & (excess > excess_threshold))
    out = t_pos
    if seeds.size:
        count = len(t_pos)
        dist = ring_distance_csr(ptr, idx, count, seeds, rings)
        free = np.flatnonzero((dist <= rings) & movable)
        out = skin.taubin_smooth(out, free, ptr, idx, iterations=iterations, lam=0.5, mu=-0.53)
    top_centers = np.array([[0.12, 1.385, 0.0], [-0.12, 1.385, 0.0]])
    zone = np.linalg.norm(a_pos[:, None, :] - top_centers[None], axis=2).min(axis=1) < 0.09
    zone[protected] = False
    return skin.taubin_smooth(out, np.flatnonzero(zone), ptr, idx, iterations=40, lam=0.5, mu=-0.53)


def ring_distance_csr(ptr: np.ndarray, idx: np.ndarray, count: int, sources: np.ndarray, limit: int) -> np.ndarray:
    """CSR 이웃 목록에서 `sources`로부터의 링 거리(limit 초과는 limit+1)."""
    dist = np.full(count, limit + 1, dtype=np.int64)
    dist[sources] = 0
    frontier = np.asarray(sources)
    for step in range(1, limit + 1):
        if frontier.size == 0:
            break
        neighbors = np.unique(np.concatenate([idx[ptr[v] : ptr[v + 1]] for v in frontier]))
        fresh = neighbors[dist[neighbors] > step]
        dist[fresh] = step
        frontier = fresh
    return dist


#: 여성 HBM 눈 중심 높이(m). 얼굴 정합·눈썹·치아·관절 상수가 이 좌표계로 적혀 있다.
FEMALE_EYE_CENTER_Y = 1.5325


def load_context(npz_path: str | Path, contract_path: str | Path, base_id: str = "female", style: Any = None) -> Context:
    """HBM npz에서 리그·스킨·T-포즈·정합·체형 필드를 준비한다(약 2초).

    남성 HBM 머리는 여성 머리와 같은 모양에 4.6 cm 높게 놓여 있다. 얼굴·입 안·눈썹·관절 상수가 여성 절대 좌표라 눈 중심 높이가 여성과 같아지도록
    몸 전체를 아래로 내려 읽고(`Context.y_shift`), 빌드를 마친 뒤 `unshift_build`로 원래 높이로 되돌린다."""
    timings: dict[str, float] = {}
    t0 = time.time()
    contract = contract_mod.load(contract_path)
    body = hbm.load(npz_path)
    y_shift = float(0.5 * (body.eyes["L"][0][:, 1].mean() + body.eyes["R"][0][:, 1].mean())) - FEMALE_EYE_CENTER_Y
    if abs(y_shift) < 0.003:
        y_shift = 0.0
    else:
        offset = np.array([0.0, y_shift, 0.0])
        body.positions = body.positions - offset
        body.eyes = {side: (positions - offset, triangles) for side, (positions, triangles) in body.eyes.items()}
        body.iris = {side: (positions - offset, triangles) for side, (positions, triangles) in body.iris.items()}
        body.face_center = body.positions[body.faces].mean(axis=1)
    if style is not None and getattr(style, "body_smooth_iterations", 0) > 0:
        from . import webtoon_style  # 순환 import를 피해 함수 안에서 가져온다

        webtoon_style.smooth_hbm_body(body, style.body_smooth_iterations)
    head_mask = hbm.head_face_mask(body)
    joints_a = landmarks.compute_a_pose_joints(body)
    landmarks.check_complete(joints_a, contract.joints)
    rig = rigmod.build_rig(joints_a, contract.joints, contract.parents)
    groups = skin.finger_vertex_groups(body, landmarks.LEFT_FINGER_SETS, landmarks.RIGHT_FINGER_SETS)
    skin_idx, skin_val, _ = skin.compute_weights(body, rig, head_mask, groups)
    ptr, idx = skin.vertex_adjacency(body.faces, len(body.positions))
    t_pos = skin.convert_to_t_pose(body.positions, skin_idx, skin_val, rig, ptr, idx)
    head_vertices_all = np.unique(body.faces[head_mask].ravel())
    t_pos = relax_arm_transition(t_pos, body.positions, rig, ptr, idx, head_vertices_all)
    timings["rig_skin_tpose"] = time.time() - t0
    quads = body.faces
    normals = welded_normals(t_pos, quads)
    head_vertices = np.unique(quads[head_mask].ravel())
    body_vertices = np.unique(quads[~head_mask].ravel())
    seam = np.intersect1d(head_vertices, body_vertices)
    frame = refit_head_frame_y(body, fields_face.fit_head_frame(body))
    fields = fields_body.BodyFields(fields_body.BodyLandmarks.from_rig(rig))
    context = Context(
        contract=contract,
        body=body,
        names=contract.joints,
        rig=rig,
        head_mask=head_mask,
        skin_idx=skin_idx,
        skin_val=skin_val,
        t_pos=t_pos,
        quads=quads,
        normals=normals,
        seam=seam,
        frame=frame,
        fields=fields,
        timings=timings,
        base_id=base_id,
        y_shift=y_shift,
    )
    if style is not None and getattr(style, "neutral_body", ()):
        from . import webtoon_style

        webtoon_style.shape_context_body(context, style)
    context.lash_style = getattr(style, "lash_style", "strands") if style is not None else "strands"  # type: ignore[attr-defined]
    return context


# ---------------------------------------------------------------- 영역

BODY_REGION_PRIORITY = None  # 계약 `hideable` 순서를 그대로 쓴다(함수 안에서 읽는다).


def ring_distance(quads: np.ndarray, vertex_count: int, sources: np.ndarray, limit: int) -> np.ndarray:
    """`sources` 정점에서 쿼드 메시 간선을 따라간 링 거리(limit 초과는 limit+1)."""
    ptr, idx = skin.vertex_adjacency(quads, vertex_count)
    dist = np.full(vertex_count, limit + 1, dtype=np.int64)
    dist[sources] = 0
    frontier = np.asarray(sources)
    for step in range(1, limit + 1):
        if frontier.size == 0:
            break
        neighbors = np.unique(np.concatenate([idx[ptr[v] : ptr[v + 1]] for v in frontier]))
        fresh = neighbors[dist[neighbors] > step]
        dist[fresh] = step
        frontier = fresh
    return dist


def assign_face_regions(ctx: Context, neck_rings: int = 3) -> np.ndarray:
    """모든 면에 영역 번호(계약 `region.all` 인덱스)를 준다. 머리 면 = head, 나머지는 HBM 해부 분할과 면 중심 x 부호(+x = 왼쪽)로 정한다.

    목(neck)은 머리/몸 이음매에서 몸 쪽으로 `neck_rings`링 안의 가슴·목 분할 면이다 — 머리 분할이 목 기둥을 이미 `TS_Head`에 넣어서
    몸에 남는 목은 목 밑동의 띠뿐이다.
    """
    ids = ctx.contract.region_ids
    body = ctx.body
    fs = body.face_set
    center = body.face_center
    side = np.where(center[:, 0] >= 0.0, "L", "R")
    ring = ring_distance(ctx.quads, len(ctx.t_pos), ctx.seam, neck_rings + 1)
    face_ring = ring[ctx.quads].min(axis=1)
    region = np.full(len(ctx.quads), -1, dtype=np.int64)

    def put(mask: np.ndarray, name: str) -> None:
        region[mask & (region < 0)] = ids.index(name)

    put(ctx.head_mask, "head")
    put((~ctx.head_mask) & (face_ring <= neck_rings) & (fs == hbm.CHEST_SET), "neck")
    put(np.isin(fs, [hbm.CHEST_SET, hbm.ABDOMEN_SET]), "torso")
    put(fs == hbm.PELVIS_SET, "pelvis")
    for s in ("L", "R"):
        m = side == s
        put(np.isin(fs, list(hbm.UPPER_ARM_SETS)) & m, f"upperArm.{s}")
        put(np.isin(fs, list(hbm.FOREARM_SETS)) & m, f"forearm.{s}")
        put((np.isin(fs, list(hbm.HAND_PALM_SETS)) | np.isin(fs, list(hbm.FINGER_SETS))) & m, f"hand.{s}")
        put(np.isin(fs, list(hbm.THIGH_SETS)) & m, f"thigh.{s}")
        put(np.isin(fs, list(hbm.CALF_SETS)) & m, f"calf.{s}")
        put((np.isin(fs, list(hbm.FOOT_SETS)) | np.isin(fs, list(hbm.FOREFOOT_SETS)) | np.isin(fs, list(hbm.TOE_SETS))) & m, f"foot.{s}")
    if (region < 0).any():
        raise RuntimeError(f"영역이 없는 면이 {(region < 0).sum()}개 있습니다.")
    return region


def vertex_regions(quads: np.ndarray, face_region: np.ndarray, vertex_count: int, region_count: int, triangle_check: bool = True, positions: np.ndarray | None = None) -> np.ndarray:
    """정점 영역: 붙은 면들의 다수결. 검증기 V10은 영역 범위의 모든 **삼각형**이 그 영역의 정점을 하나 이상 가질 것을 요구하므로
    위반 삼각형이 남지 않게 정점 영역을 몇 번 고친다. `positions`를 주면 몸 메시와 같은 대각선 선택(`quads_to_triangles`)으로 삼각형 단위로 검사한다
    (쿼드에서 영역 정점이 한 모서리뿐이면 대각선이 그 모서리를 지나지 않을 때 한 삼각형이 영역 정점을 못 갖는다 — 남성 베이스 팔에서 생겼다).
    주지 않으면 쿼드 단위로만 검사한다."""
    votes = np.zeros((vertex_count, region_count), dtype=np.int32)
    for k in range(4):
        np.add.at(votes, (quads[:, k], face_region), 1)
    result = votes.argmax(axis=1)
    if positions is not None:
        triangles = quads_to_triangles(positions, quads)
        triangle_region = np.repeat(face_region, 2)
    else:
        triangles = quads
        triangle_region = face_region
    for _ in range(24):
        bad = ~(result[triangles] == triangle_region[:, None]).any(axis=1)
        if not bad.any():
            return result
        for f in np.flatnonzero(bad):
            corners = triangles[f]
            # 이 면의 영역 표를 가장 많이 가진 모서리를 그 영역으로 바꾼다
            best = corners[np.argmax(votes[corners, triangle_region[f]])]
            result[best] = triangle_region[f]
    bad = ~(result[triangles] == triangle_region[:, None]).any(axis=1)
    if bad.any() and triangle_check:
        raise RuntimeError(f"정점 영역을 고쳐도 위반 면이 {bad.sum()}개 남았습니다.")
    return result


# ---------------------------------------------------------------- 몸/머리 메시


@dataclass
class SplitMesh:
    """UV로 정점이 나뉜 몸 또는 머리 메시(용접 번호와 조각 정보 포함)."""

    name: str
    origin: np.ndarray  # (N,) 용접 정점 번호
    uv: np.ndarray  # (N,2)
    quads: np.ndarray  # (M,4) 분할 정점 번호(정렬 후)
    quad_face: np.ndarray  # (M,) 원래 면 번호
    triangles: np.ndarray  # (2M,3)
    positions: np.ndarray  # (N,3) T-포즈
    apose: np.ndarray  # (N,3)
    normals: np.ndarray  # (N,3)
    joints: np.ndarray
    weights: np.ndarray
    region: np.ndarray  # (N,) uint8


def build_split_mesh(ctx: Context, name: str, face_mask: np.ndarray, face_region: np.ndarray, order_by_region: bool, margin: float = 0.003) -> SplitMesh:
    quads_all = ctx.quads
    face_ids = np.flatnonzero(face_mask)
    used = np.unique(quads_all[face_ids].ravel())
    remap = -np.ones(len(ctx.t_pos), dtype=np.int64)
    remap[used] = np.arange(len(used))
    local_quads = remap[quads_all[face_ids]]
    origin_local, uv, new_quads = uvtools.unwrap_and_pack(ctx.t_pos[used], local_quads, margin=margin)
    origin = used[origin_local]
    if order_by_region:
        ranking = np.argsort(face_region[face_ids], kind="stable")
        new_quads = new_quads[ranking]
        face_ids = face_ids[ranking]
    positions = ctx.t_pos[origin]
    triangles = quads_to_triangles(positions, new_quads)
    region_of_vertex = vertex_regions(quads_all, face_region, len(ctx.t_pos), len(ctx.contract.region_ids), positions=ctx.t_pos)
    return SplitMesh(
        name=name,
        origin=origin,
        uv=uv.astype(np.float32),
        quads=new_quads,
        quad_face=face_ids,
        triangles=triangles,
        positions=positions,
        apose=ctx.body.positions[origin],
        normals=ctx.normals[origin],
        joints=ctx.skin_idx[origin],
        weights=ctx.skin_val[origin],
        region=region_of_vertex[origin].astype(np.uint8),
    )


def region_ranges(mesh: SplitMesh, face_region: np.ndarray, region_ids: list[str], hideable: list[str]) -> list[dict[str, Any]]:
    """정렬된 몸 삼각형에서 영역별 인덱스 범위(kit.json `bodyRegions`)를 만든다. 순서는 계약 `hideable` 순서가 아니라 인덱스 순서다."""
    quad_region = face_region[mesh.quad_face]
    ranges: list[dict[str, Any]] = []
    start = 0
    for r in np.unique(quad_region):  # 정렬되어 있으므로 오름차순 = 인덱스 순서
        count = int((quad_region == r).sum())
        name = region_ids[int(r)]
        if name not in hideable:
            raise RuntimeError(f"몸 메시에 숨길 수 없는 영역({name}) 면이 있습니다.")
        ranges.append({"id": name, "mesh": BODY_NODE, "indexStart": start * 6, "indexCount": count * 6})
        start += count
    missing = [name for name in hideable if name not in {item["id"] for item in ranges}]
    if missing:
        raise RuntimeError(f"몸 영역이 비어 있습니다: {missing}")
    return ranges


# ---------------------------------------------------------------- 입 안 분류와 턱 가중치


def classify_interior(ctx: Context, head: SplitMesh, roi: tuple[float, float, float, float, float] = (0.055, 1.42, 1.52, 0.04, 0.20), min_component: int = 40) -> np.ndarray:
    """머리 면 중 "닫힌 안쪽"(구강·콧구멍 안벽)을 가려낸다. 면 중심에서 법선 방향 광선을 쏘아 머리 표면에 다시 부딪히면 안쪽이다.

    구강은 입술이 닿은 가는 틈 뒤의 닫힌 주머니라 법선 광선이 반대편 벽에 막힌다. 반환은 `head.quad_face` 순서(분할 전 쿼드 기준 (M,))의
    불리언이다. 관심 영역 밖은 항상 False.
    """
    xmax, y0, y1, z0, z1 = roi
    positions = ctx.t_pos
    quads = ctx.quads[head.quad_face]
    a, b, c, d = (positions[quads[:, k]] for k in range(4))
    normal = np.cross(c - a, d - b)
    normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)
    center = (a + b + c + d) / 4.0
    candidate = (np.abs(center[:, 0]) < xmax) & (center[:, 1] > y0) & (center[:, 1] < y1) & (center[:, 2] > z0) & (center[:, 2] < z1)
    surface = Surface(head.positions, head.triangles)
    interior = np.zeros(len(quads), dtype=bool)
    idx = np.flatnonzero(candidate)
    if idx.size:
        _, hit = surface.ray(center[idx] + normal[idx] * 1e-4, normal[idx], max_distance=0.2)
        interior[idx[hit >= 0]] = True
    # 인중 같은 얕은 홈이 우연히 걸린 작은 조각은 버리고 구강·콧구멍처럼 큰 연결 덩어리만 남긴다.
    adjacency = hbm.face_adjacency(quads)
    for component in hbm.connected_components(interior, adjacency):
        if len(component) < min_component:
            interior[component] = False
    return interior


def harmonic_scalar(count: int, edges_a: np.ndarray, edges_b: np.ndarray, fixed_mask: np.ndarray, fixed_value: np.ndarray, iterations: int = 600) -> np.ndarray:
    """간선 그래프에서 고정 정점을 경계로 하는 조화 보간(균일 라플라시안, 자코비 반복)."""
    degree = np.zeros(count)
    np.add.at(degree, edges_a, 1.0)
    np.add.at(degree, edges_b, 1.0)
    value = np.where(fixed_mask, fixed_value, 0.5)
    free = ~fixed_mask
    for _ in range(iterations):
        total = np.zeros(count)
        np.add.at(total, edges_a, value[edges_b])
        np.add.at(total, edges_b, value[edges_a])
        value = np.where(free, total / np.maximum(degree, 1.0), fixed_value)
    return value


JAW_ZONE_HALF_WIDTH = 0.050
JAW_ZONE_Y = (1.432, 1.498)
JAW_ZONE_MIN_Z = 0.05
#: 입 안쪽 가중치: 씹는 면(입선) 높이와 앞·뒤 전환 폭(m). 앞(z ≥ 0.14)은 2.5 mm, 뒤(z ≤ 0.07)는 3 cm.
JAW_OCCLUSAL_Y = 1.4653
JAW_INTERIOR_FRONT_Z = 0.14
JAW_INTERIOR_BACK_Z = 0.07
JAW_INTERIOR_BAND_FRONT = 0.0025
JAW_INTERIOR_BAND_BACK = 0.030
#: 입술 고리 값을 입 안 면이 이어받는 거리(m)와 고리로 칠 최대 높이(콧구멍 고리는 제외)
JAW_RING_REACH = 0.024
JAW_RING_MAX_Y = 1.485
JAW_INTERIOR_SMOOTH_ITERATIONS = 15


def dijkstra(count: int, edge_a: np.ndarray, edge_b: np.ndarray, lengths: np.ndarray, sources: np.ndarray) -> np.ndarray:
    """간선 그래프에서 `sources`로부터의 최단 경로 길이(닿지 못하면 inf). 무방향."""
    return dijkstra_nearest(count, edge_a, edge_b, lengths, sources)[0]


def dijkstra_nearest(count: int, edge_a: np.ndarray, edge_b: np.ndarray, lengths: np.ndarray, sources: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """`dijkstra`와 같되 정점마다 가장 가까운 소스(`sources`의 정점 번호, 닿지 못하면 -1)도 돌려준다."""
    import heapq

    order = np.argsort(np.concatenate([edge_a, edge_b]), kind="stable")
    ends_from = np.concatenate([edge_a, edge_b])[order]
    ends_to = np.concatenate([edge_b, edge_a])[order]
    weight = np.concatenate([lengths, lengths])[order]
    start = np.searchsorted(ends_from, np.arange(count + 1))
    dist = np.full(count, np.inf)
    nearest = np.full(count, -1, dtype=np.int64)
    heap: list[tuple[float, int]] = []
    for source in np.asarray(sources).tolist():
        dist[source] = 0.0
        nearest[source] = source
        heap.append((0.0, source))
    heapq.heapify(heap)
    while heap:
        d, v = heapq.heappop(heap)
        if d > dist[v]:
            continue
        for k in range(start[v], start[v + 1]):
            u, nd = int(ends_to[k]), d + float(weight[k])
            if nd < dist[u]:
                dist[u] = nd
                nearest[u] = nearest[v]
                heapq.heappush(heap, (nd, u))
    return dist, nearest


def jaw_weights(ctx: Context, head: SplitMesh, interior_face: np.ndarray) -> np.ndarray:
    """머리 정점마다 턱을 따르는 정도 (N,) — `facs:jawOpen`·`mouthFunnel`의 회전 가중치.

    얼굴 필드(`face_fields._jaw_mask`)는 입선 높이로만 위아래를 가르는데 HBM 입술은 위·아래가 접촉선에서 같은 높이로 닿고 입 안은 닫힌
    주머니라서 그대로 쓰면 입술 가장자리가 들쭉날쭉하고 구강 벽이 가는 띠로 늘어진다. 그래서 입 주변 상자 안의 **바깥 면** 정점은
    표면 그래프 위 경로 길이로 정한다: 윗쪽 경계(코밑)까지 거리 `d_up`, 아래쪽 경계(턱)까지 거리 `d_low`일 때 비율 `d_up / (d_up + d_low)`를
    0.3~0.7 구간에서 smoothstep한 값.
    두 입술은 닫힌 틈에서 그래프로 이어져 있지 않아(입꼬리로만 이어진다) 윗입술은 0, 아랫입술은 1에 가깝고 입꼬리에서 부드럽게 바뀐다.
    상자 가장자리에서는 필드 마스크로 이어 붙인다. **입 안쪽**(바깥 면과 공유하지 않는 정점)은 입선 높이를 기준으로 한 기하 함수다 — 입천장은 0,
    바닥은 1이고 뒷벽은 높이를 따라 부드럽게 이어진다(조화 보간은 큰 주머니의 평균(0.5)으로 쏠려 입이 덜 열렸다). 다만 입술 고리(바깥 면과 입 안
    면이 만나는 정점)에서 입 안 면을 따라 `JAW_RING_REACH` 안쪽은 가장 가까운 고리 값을 이어받아 기하 값으로 서서히 넘어가고, 입 안 값만 이웃 평균으로
    몇 번 고른다 — 입꼬리 주름에서 간선 하나가 0.5의 값 차를 떠안으면 열릴 때 107배까지 늘어나 지느러미로 찢어졌다(이어받기 뒤 입꼬리 최대 늘어남 ≈ 8배)."""
    n = len(head.positions)
    local = ctx.frame.to_local(head.positions)
    ts_mask = ff.jaw_mask_local(local)
    quads = head.quads
    weld = head.origin
    unique, inverse = np.unique(weld, return_inverse=True)
    m = len(unique)
    welded_pos = np.zeros((m, 3))
    welded_pos[inverse] = head.positions
    welded_mask = np.zeros(m)
    welded_mask[inverse] = ts_mask

    def edges_of(face_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        q = inverse[quads[face_mask]]
        return np.concatenate([q[:, k] for k in range(4)]), np.concatenate([q[:, (k + 1) % 4] for k in range(4)])

    ext_a, ext_b = edges_of(~interior_face)
    int_a, int_b = edges_of(interior_face)
    exterior = np.zeros(m, dtype=bool)
    exterior[ext_a] = True
    exterior[ext_b] = True
    interior_only = np.zeros(m, dtype=bool)
    interior_only[int_a] = True
    interior_only[int_b] = True
    interior_only &= ~exterior
    box = (np.abs(welded_pos[:, 0]) < JAW_ZONE_HALF_WIDTH) & (welded_pos[:, 1] > JAW_ZONE_Y[0]) & (welded_pos[:, 1] < JAW_ZONE_Y[1]) & (welded_pos[:, 2] > JAW_ZONE_MIN_Z) & exterior
    lengths = np.linalg.norm(welded_pos[ext_a] - welded_pos[ext_b], axis=1)
    top = np.flatnonzero(box & (welded_pos[:, 1] >= JAW_ZONE_Y[1] - 0.004))
    bottom = np.flatnonzero(box & (welded_pos[:, 1] <= JAW_ZONE_Y[0] + 0.004))
    d_up = dijkstra(m, ext_a, ext_b, lengths, top)
    d_low = dijkstra(m, ext_a, ext_b, lengths, bottom)
    both = np.isfinite(d_up) & np.isfinite(d_low)
    ratio = np.where(both, np.where(both, d_up, 0.0) / np.maximum(np.where(both, d_up + d_low, 1.0), 1e-9), 0.5)
    voronoi = np.where(both, bt.smooth(0.30, 0.70, ratio), welded_mask)  # 두 입술을 가르는 비율을 날카롭게(입꼬리 근처만 중간값)
    edge_blend = bt.smooth(0.036, JAW_ZONE_HALF_WIDTH, np.abs(welded_pos[:, 0]))
    value = np.where(box, (1.0 - edge_blend) * voronoi + edge_blend * welded_mask, welded_mask)
    # 입 안쪽: 씹는 면(입선 높이) 아래는 턱, 위는 머리. 앞(입술 근처)은 날카롭게, 뒤(인두)로 갈수록 높이를 따라 부드럽게 바뀐다.
    depth = bt.smooth(JAW_INTERIOR_FRONT_Z, JAW_INTERIOR_BACK_Z, welded_pos[:, 2])
    band = JAW_INTERIOR_BAND_FRONT + (JAW_INTERIOR_BAND_BACK - JAW_INTERIOR_BAND_FRONT) * depth
    geometric = 1.0 - bt.smooth(JAW_OCCLUSAL_Y - band, JAW_OCCLUSAL_Y + band, welded_pos[:, 1])
    # 입술 고리(바깥 면과 입 안 면이 만나는 정점)의 값에서 입 안 면을 따라 `JAW_RING_REACH` 안쪽은 가장 가까운 고리 값을 이어받고 멀어질수록
    # 기하 값으로 넘어간다 — 입꼬리에서 고리(0.5 안팎)와 입 안 면(0 또는 1)이 0.1 mm 간격에서 갈리면 모서리가 수 cm로 찢어져 지느러미가 된다.
    ring = np.flatnonzero(exterior & ~interior_only & np.isin(np.arange(m), np.unique(inverse[quads[interior_face]])) & (welded_pos[:, 1] < JAW_RING_MAX_Y) & (np.abs(welded_pos[:, 0]) < JAW_ZONE_HALF_WIDTH))
    int_lengths = np.linalg.norm(welded_pos[int_a] - welded_pos[int_b], axis=1)
    reach, nearest = dijkstra_nearest(m, int_a, int_b, int_lengths, ring)
    inherited = np.where(nearest >= 0, value[np.maximum(nearest, 0)], geometric)
    blend = bt.smooth(0.0, JAW_RING_REACH, np.where(np.isfinite(reach), reach, 1.0))
    interior_value = inherited * (1.0 - blend) + geometric * blend
    value = np.where(interior_only, interior_value, value)
    # 입 안 면 값만 이웃 평균으로 몇 번 고르게 한다(바깥 면과 고리는 고정). 얇은 입꼬리 주름의 값 차가 간선 하나에 몰리지 않게 한다.
    smooth_count = np.zeros(m)
    smooth_sum = np.zeros(m)
    for _ in range(JAW_INTERIOR_SMOOTH_ITERATIONS):
        smooth_sum[:] = 0.0
        smooth_count[:] = 0.0
        np.add.at(smooth_sum, int_a, value[int_b])
        np.add.at(smooth_sum, int_b, value[int_a])
        np.add.at(smooth_count, int_a, 1.0)
        np.add.at(smooth_count, int_b, 1.0)
        average = np.where(smooth_count > 0, smooth_sum / np.maximum(smooth_count, 1.0), value)
        value = np.where(interior_only, 0.5 * value + 0.5 * average, value)
    return value[inverse]


# ---------------------------------------------------------------- morph 델타


def morph_name_order(contract: contract_mod.Contract) -> list[str]:
    return contract.morph_names


def split_morph_name(name: str) -> tuple[str, str, str]:
    """`param:height:+` → ("param", "height", "+"), `facs:jawOpen` → ("facs", "jawOpen", "")."""
    parts = name.split(":")
    if parts[0] == "param":
        return "param", parts[1], parts[2]
    return "facs", parts[1], ""


def body_world_delta(ctx: Context, key: str, sign: float, points: np.ndarray) -> np.ndarray:
    return sign * ctx.fields.field(key, points)


def face_world_delta(ctx: Context, name: str, points: np.ndarray, scope: int | np.ndarray) -> np.ndarray:
    local = ctx.frame.to_local(points)
    return ctx.frame.to_world_delta(ff.morph_delta(name, local, scope))


def patch_jaw(ctx: Context, name: str, points: np.ndarray, delta: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """표면 스코프 점의 `jawOpen`/`mouthFunnel` 델타에서 필드의 턱 회전 항을 `mask` 가중 회전으로 바꿔 끼운다."""
    angle = {"facs:jawOpen": 0.35, "facs:mouthFunnel": 0.08}.get(name)
    if angle is None:
        return delta
    local = ctx.frame.to_local(points)
    old = ff._jaw_rotation(local, ff.jaw_mask_local(local), angle)  # noqa: SLF001 — 같은 패키지의 TS 이식 필드를 재사용한다
    new = ff._jaw_rotation(local, mask, angle)  # noqa: SLF001
    return delta + ctx.frame.to_world_delta(new - old)


def ordered(names: set[str] | list[str], contract: contract_mod.Contract) -> list[str]:
    order = {name: i for i, name in enumerate(contract.morph_names)}
    return sorted(set(names), key=lambda n: order[n])


def seam_gap_by_key(ctx: Context, head_origin_vertices: np.ndarray) -> dict[str, float]:
    """체형 키마다 이음매 정점에서 몸 델타의 최대 크기(m) — 머리에 같은 타깃이 없으면 그만큼 목이 벌어진다."""
    gaps: dict[str, float] = {}
    for key in fields_body.BODY_KEYS:
        faded = fade_small(ctx.fields.field(key, ctx.t_pos[ctx.seam]))
        gaps[key] = float(np.linalg.norm(faded, axis=1).max())
    return gaps


def head_body_keys(ctx: Context) -> list[str]:
    """머리 메시에 둘 체형 키: 계약이 요구하는 4개 + 이음매 틈을 만드는 키."""
    required = list(HEAD_ATTACHED_BODY_KEYS)
    gaps = seam_gap_by_key(ctx, ctx.seam)
    extra = [key for key in HEAD_SEAM_BODY_KEYS if gaps[key] > SEAM_GAP_LIMIT_M]
    return required + extra


def compute_body_prim_deltas(ctx: Context, points: np.ndarray, keys: list[str] | tuple[str, ...]) -> dict[str, np.ndarray]:
    """체형 키 목록의 ± 위치 델타(float64, 꼬리 정리 적용). 이름은 계약 이름 그대로."""
    out: dict[str, np.ndarray] = {}
    for key in keys:
        plus = fade_small(ctx.fields.field(key, points))
        out[f"param:{key}:+"] = plus
        out[f"param:{key}:-"] = -plus
    return out


def cast_f32(deltas: dict[str, np.ndarray], contract: contract_mod.Contract) -> dict[str, np.ndarray]:
    return {name: np.ascontiguousarray(deltas[name], dtype=np.float32) for name in ordered(list(deltas), contract)}


def compute_head_deltas(
    ctx: Context,
    head: SplitMesh,
    jaw: np.ndarray,
    body_keys: list[str],
    welded_body: dict[str, np.ndarray],
    overrides: dict[str, Any] | None = None,
) -> dict[str, np.ndarray]:
    """TS_Head의 morph 위치 델타: 체형 키 + 얼굴 30 + FACS 16. 체형 델타는 용접 배열에서 가져와 몸 메시와 이음매 값이 같다.
    얼굴 델타는 목 이음매에서 0이 되도록 테이퍼를 곱한다.

    `overrides`는 이름 → 위치 함수(`points → (N,3) 월드 델타`)로, TS 필드 대신 HBM 머리에 맞춰 다시 짠 morph(눈 깜빡임)를 끼운다."""
    points = head.positions
    deltas = {f"param:{key}:{sign}": welded_body[f"param:{key}:{sign}"][head.origin] for key in body_keys for sign in ("+", "-")}
    taper = fields_face.seam_taper(points, ctx.t_pos[ctx.seam])[:, None]
    for name in fields_face.FACE_MORPH_NAMES:
        if overrides and name in overrides:
            delta = overrides[name](points)
        else:
            delta = face_world_delta(ctx, name, points, ff.SCOPE_SURFACE)
            delta = patch_jaw(ctx, name, points, delta, jaw)
        deltas[name] = fade_small(delta * taper)
    return deltas


def normal_deltas(ctx: Context, name_to_full_delta: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """용접된 전체 메시(몸+머리)에 morph를 적용했을 때의 정점 법선 변화 (용접 정점 기준, 꼬리 정리)."""
    tris = np.concatenate([ctx.quads[:, [0, 1, 2]], ctx.quads[:, [0, 2, 3]]], axis=0)
    result: dict[str, np.ndarray] = {}
    for name, delta in name_to_full_delta.items():
        morphed = vertex_normals(ctx.t_pos + delta, tris)
        dn = morphed - ctx.normals
        result[name] = fade_small(dn, NORMAL_FADE_LO, NORMAL_FADE_HI)  # 모듈 상수를 호출 시점에 읽는다
    return result


def full_delta_for(count: int, parts: list[tuple[np.ndarray, np.ndarray]]) -> np.ndarray:
    """용접 정점 배열(count,3)에 (정점 번호, 델타) 조각들을 채운다. 같은 정점이 여러 번 나오면 마지막 값(UV 복제 정점은 값이 같다)."""
    full = np.zeros((count, 3))
    for vertex_ids, delta in parts:
        full[vertex_ids] = delta
    return full


def joint_offsets_table(ctx: Context) -> dict[str, dict[str, list[float]]]:
    """체형 morph(±)마다 관절 오프셋(부모 로컬 평행이동에 더하는 양, m). 레스트 회전이 항등이라 월드 변위의 부모 차이와 같다."""
    rig = ctx.rig
    table: dict[str, dict[str, list[float]]] = {}
    for key in fields_body.BODY_KEYS:
        for sign, label in ((1.0, "+"), (-1.0, "-")):
            world = sign * fade_small(ctx.fields.field(key, rig.t_pose))
            entry: dict[str, list[float]] = {}
            for i, joint in enumerate(rig.names):
                parent = rig.parents[joint]
                local = world[i] - (world[rig.index(parent)] if parent is not None else 0.0)
                if float(np.max(np.abs(local))) >= 1e-6:
                    entry[joint] = [round(float(v), 7) for v in local]
            if entry:
                table[f"param:{key}:{label}"] = entry
    return table


# ---------------------------------------------------------------- V9 척도(검증기와 같은 계산)


def follow_deviation(
    subject_positions: np.ndarray,
    subject_targets: dict[str, np.ndarray],
    reference_positions: np.ndarray,
    reference_targets: dict[str, np.ndarray],
    names: list[str] | None = None,
    quantile: float = 1.0,
    radius: float = 0.06,
) -> dict[str, Any]:
    """검증기 V9 "따라가기"(`verifyMorphFollow`)와 같은 척도: 대상 정점마다 기준 메시에서 가장 가까운 정점(반경 `radius`) 하나를 찾고
    같은 이름 morph의 변위 차 |Δ대상 − Δ기준|(m)의 `quantile` 분위수(기본 1 = 최댓값)를 이름별로 돌려준다. 반경 안에 기준 정점이 없는
    정점은 비교하지 않고 `unmatched`로 센다. 경고 5 mm·오류 15 mm."""
    import bpy  # noqa: F401 — mathutils는 bpy 뒤에만 가져올 수 있다
    from mathutils import kdtree

    tree = kdtree.KDTree(len(reference_positions))
    for i, p in enumerate(reference_positions.tolist()):
        tree.insert(p, i)
    tree.balance()
    nearest = np.full(len(subject_positions), -1, dtype=np.int64)
    for v, p in enumerate(subject_positions.tolist()):
        _, index, dist = tree.find(p)
        if dist <= radius:
            nearest[v] = index
    matched = nearest >= 0
    pool = names if names is not None else [name for name in subject_targets if name in reference_targets]
    stats: dict[str, dict[str, float]] = {}
    for name in pool:
        if name not in subject_targets or name not in reference_targets:
            continue
        diff = np.linalg.norm(subject_targets[name][matched].astype(np.float64) - reference_targets[name][nearest[matched]].astype(np.float64), axis=1)
        order = np.sort(diff)
        index = min(len(order) - 1, max(0, int(np.ceil(quantile * len(order))) - 1)) if len(order) else 0
        stats[name] = {"statistic": float(order[index]) if len(order) else 0.0, "max": float(order[-1]) if len(order) else 0.0}
    worst = max(stats.items(), key=lambda item: item[1]["statistic"], default=None)
    return {
        "matched": int(matched.sum()),
        "unmatched": int((~matched).sum()),
        "perTarget": stats,
        "worst": None if worst is None else {"name": worst[0], **worst[1]},
    }


def seam_mismatch(first_positions: np.ndarray, first_targets: dict[str, np.ndarray], second_positions: np.ndarray, second_targets: dict[str, np.ndarray], tolerance: float = 1e-6) -> dict[str, Any]:
    """검증기 V9 이음매 검사(`verifyMorphSeam`)와 같은 척도: 같은 위치(허용 거리)의 정점 쌍에서 공유 타깃 델타 차의 최댓값."""
    shared = [name for name in first_targets if name in second_targets]
    keys = {}
    for i, p in enumerate(np.round(first_positions / max(tolerance, 1e-9)).astype(np.int64).tolist()):
        keys.setdefault(tuple(p), []).append(i)
    pairs = 0
    worst = 0.0
    worst_name = None
    for j, p in enumerate(np.round(second_positions / max(tolerance, 1e-9)).astype(np.int64).tolist()):
        for i in keys.get(tuple(p), []):
            pairs += 1
            for name in shared:
                diff = float(np.linalg.norm(first_targets[name][i].astype(np.float64) - second_targets[name][j].astype(np.float64)))
                if diff > worst:
                    worst, worst_name = diff, name
    return {"pairs": pairs, "shared": shared, "maxDelta": worst, "worst": worst_name}


# ---------------------------------------------------------------- 피부 면 색(상대색)


#: 콧구멍 덩어리 열기 반지름(면): 너비 2면 이하의 돌기를 뗀다
NOSTRIL_OPEN_RADIUS = 1


def interior_components(ctx: Context, head: SplitMesh, interior_face: np.ndarray) -> np.ndarray:
    """용접 면 번호별 입 안 덩어리 번호(-1 = 안쪽 아님, 0 = 가장 큰 덩어리 = 구강, 1.. = 콧구멍 등)."""
    quads = ctx.quads[head.quad_face]
    adjacency = hbm.face_adjacency(quads)
    components = sorted(hbm.connected_components(interior_face, adjacency), key=len, reverse=True)
    corner_adjacency = face_corner_adjacency(quads)
    out = np.full(len(ctx.quads), -1, dtype=np.int64)
    for number, component in enumerate(components):
        members = np.array(component)
        if number >= 1:
            members = opened_faces(members, corner_adjacency)
        out[head.quad_face[members]] = number
    return out


def face_corner_adjacency(faces: np.ndarray) -> list[list[int]]:
    """꼭짓점 하나라도 공유하는 면 인접 리스트(8-이웃). 간선만 공유하는 `hbm.face_adjacency`보다 넓다."""
    by_vertex: dict[int, list[int]] = {}
    for face, corners in enumerate(faces.tolist()):
        for vertex in corners:
            by_vertex.setdefault(vertex, []).append(face)
    adjacency: list[set[int]] = [set() for _ in range(len(faces))]
    for owners in by_vertex.values():
        for face in owners:
            adjacency[face].update(owners)
    return [sorted(neighbors - {face}) for face, neighbors in enumerate(adjacency)]


def opened_faces(members: np.ndarray, adjacency: list[list[int]], radius: int = NOSTRIL_OPEN_RADIUS) -> np.ndarray:
    """면 집합의 열기(erode → dilate, 8-이웃 `adjacency`) — 너비 3면 미만의 돌기를 떼어낸다.

    콧구멍 둘레는 법선 광선 시험이 콧방울 바깥 면 몇 장을 안쪽으로 오분류해 콧구멍 아래로 짙은 색의 돌기(탭)가 삐져나왔다. 같은 덩어리 안에서만
    되돌려 키워 원래 덩어리 밖으로는 번지지 않게 한다. 열기로 모두 사라지는 작은 집합은 원래 집합을 그대로 돌려준다. (간선만 공유하는 4-이웃으로
    열면 돌기가 붙은 면이 살아남아 돌기의 첫 면이 되돌아온다.)"""
    inside = np.zeros(len(adjacency), dtype=bool)
    inside[members] = True
    current = inside.copy()
    for _ in range(radius):
        eroded = current.copy()
        for face in np.flatnonzero(current).tolist():
            if not all(current[n] for n in adjacency[face]):
                eroded[face] = False
        current = eroded
    if not current.any():
        return members
    for _ in range(radius):
        grown = current.copy()
        for face in np.flatnonzero(current).tolist():
            for n in adjacency[face]:
                if inside[n]:
                    grown[n] = True
        current = grown
    return np.flatnonzero(current)


def skin_face_colors(ctx: Context, interior_component: np.ndarray) -> np.ndarray:
    """모든 용접 면의 피부 상대색 (F,3) float32(0..1). 흰색이 기준이고 앱의 스킨 틴트가 곱해진다."""
    quads = ctx.quads
    center = ctx.t_pos[quads].mean(axis=1)
    face_set = ctx.body.face_set
    ptr, idx = skin.vertex_adjacency(quads, len(ctx.t_pos))
    cavity = bt.vertex_cavity(ctx.t_pos, ctx.normals, ptr, idx)
    shade = 1.0 - 0.13 * np.clip(cavity[quads].mean(axis=1) / 0.0012, 0.0, 1.0)
    shade *= 1.0 + 0.030 * (bt.value_noise3(center, 13.0, 1) - 0.5) * 2.0 + 0.018 * (bt.value_noise3(center, 47.0, 2) - 0.5) * 2.0
    color = np.ones((len(quads), 3)) * shade[:, None]

    def blob(point: tuple[float, float, float], sigma: float) -> np.ndarray:
        return np.exp(-np.sum((center - np.array(point)) ** 2, axis=1) / (2.0 * sigma * sigma))

    def tint(weight: np.ndarray, rgb: tuple[float, float, float]) -> None:
        nonlocal color
        color = color * (1.0 - weight[:, None] * (1.0 - np.array(rgb)))

    for sx in (1.0, -1.0):
        tint(0.55 * blob((sx * 0.046, 1.489, 0.117), 0.022), (1.0, 0.89, 0.90))  # 볼 홍조
    tint(0.60 * blob((0.0, 1.503, 0.166), 0.009), (1.0, 0.88, 0.89))  # 코끝
    tint(np.isin(face_set, [4, 5]).astype(float) * 0.9, (1.0, 0.90, 0.89))  # 귀
    for joint in ("mixamorig:LeftForeArm", "mixamorig:RightForeArm", "mixamorig:LeftLeg", "mixamorig:RightLeg"):  # 팔꿈치·무릎
        tint(0.55 * blob(tuple(ctx.rig.t_pose[ctx.joint_index[joint]]), 0.032), (1.0, 0.92, 0.92))
    lips = (face_set == 8) & (interior_component < 0) & ctx.head_mask
    color[lips] = np.array([1.0, 0.69, 0.71]) * shade[lips][:, None]
    lining = np.isin(face_set, [2, 3])  # 눈구멍 안쪽 면(눈초리 쪽에 보인다)
    color[lining] = np.array([0.98, 0.74, 0.72]) * shade[lining][:, None]
    mouth = interior_component == 0
    depth = bt.smooth(0.0, 1.0, (0.1508 - center[:, 2]) / 0.012)
    mouth_color = (1.0 - depth)[:, None] * np.array([1.0, 0.58, 0.60]) + depth[:, None] * np.array([0.34, 0.075, 0.085])
    color[mouth] = mouth_color[mouth]
    other = interior_component >= 1  # 콧구멍 안
    color[other] = np.array([0.30, 0.11, 0.10])
    return np.clip(color, 0.0, 1.0).astype(np.float32)


# ---------------------------------------------------------------- 속옷 셸

UNDERWEAR_OFFSET = 0.0020
UNDERWEAR_RIM_OFFSET = 0.0004
BRA_Y_RANGE = (1.100, 1.235)
BRA_ROWS = 20
BRA_COLUMNS = 96
BRA_AXIS_Z = 0.035


def boundary_edges(quads: np.ndarray) -> list[tuple[int, int]]:
    """쿼드 집합에서 한 면에만 속한 간선(면의 감김 순서대로 방향이 있다)."""
    count: dict[tuple[int, int], int] = {}
    directed: dict[tuple[int, int], tuple[int, int]] = {}
    for quad in quads.tolist():
        for k in range(4):
            a, b = quad[k], quad[(k + 1) % 4]
            key = (a, b) if a < b else (b, a)
            count[key] = count.get(key, 0) + 1
            directed[key] = (a, b)
    return [directed[key] for key, c in count.items() if c == 1]


def body_surface(ctx: Context, face_mask: np.ndarray | None = None) -> Surface:
    """용접 몸 메시의 삼각형 표면(BVH). `face_mask`(면 불리언)를 주면 그 면만 쓴다 — 정점 번호는 용접 번호 그대로다."""
    quads = ctx.quads if face_mask is None else ctx.quads[face_mask]
    tris = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]], axis=0)
    return Surface(ctx.t_pos, tris)


@dataclass
class ShellParts:
    positions: np.ndarray
    triangles: np.ndarray
    normals: np.ndarray


def merge_shells(parts: list[ShellParts]) -> ShellParts:
    offset = 0
    positions, triangles, normals = [], [], []
    for part in parts:
        positions.append(part.positions)
        triangles.append(part.triangles + offset)
        normals.append(part.normals)
        offset += len(part.positions)
    return ShellParts(np.concatenate(positions), np.concatenate(triangles), np.concatenate(normals))


def rim_shell(outer: np.ndarray, inner: np.ndarray, normals: np.ndarray, edges: list[tuple[int, int]]) -> ShellParts:
    """셸 가장자리의 두께 띠. `outer`/`inner`는 같은 정점 번호의 바깥·안쪽 위치, `edges`는 경계 간선(a→b). 띠는 면 바깥 방향을 본다."""
    positions: list[np.ndarray] = []
    out_normals: list[np.ndarray] = []
    triangles: list[list[int]] = []
    for a, b in edges:
        edge = outer[b] - outer[a]
        r = np.cross(edge, normals[a] + normals[b])
        length = np.linalg.norm(r)
        if length < 1e-12:
            continue
        r /= length
        base = len(positions)
        positions.extend([outer[a], inner[a], inner[b], outer[b]])
        out_normals.extend([r, r, r, r])
        quad = [base, base + 1, base + 2, base + 3]
        pa, pb, pc = positions[base], positions[base + 1], positions[base + 2]
        if np.dot(np.cross(pb - pa, pc - pa), r) < 0:
            quad = quad[::-1]
        triangles.append([quad[0], quad[1], quad[2]])
        triangles.append([quad[0], quad[2], quad[3]])
    if not positions:
        return ShellParts(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64), np.zeros((0, 3)))
    return ShellParts(np.array(positions), np.array(triangles, dtype=np.int64), np.array(out_normals))


def smooth_shell_grid(outer: np.ndarray, rows: int, columns: int, iterations: int = 4) -> np.ndarray:
    """원통 격자 셸(행 × (열+1), 마지막 열 = 첫 열 복제)을 라플라시안으로 살짝 평활한다 — 천이 주름·좁은 골을 따라 파고들지 않고 건너뛰게 한다."""
    grid = outer.reshape(rows, columns + 1, 3).copy()
    for _ in range(iterations):
        core = grid[:, :columns]
        lateral = 0.5 * (np.roll(core, 1, axis=1) + np.roll(core, -1, axis=1))
        vertical = core.copy()
        vertical[1:-1] = 0.5 * (core[:-2] + core[2:])
        new_core = core + 0.5 * (0.5 * (lateral - core) + 0.5 * (vertical - core))
        grid[:, :columns] = new_core
        grid[:, columns] = new_core[:, 0]
    return grid.reshape(-1, 3)


def clear_shell(
    surface: Surface,
    positions: np.ndarray,
    triangles: np.ndarray,
    normals: np.ndarray,
    clearance: float = 0.0010,
    iterations: int = 10,
) -> tuple[np.ndarray, int]:
    """셸이 몸 표면에 `clearance`보다 가까이 붙거나 파고든 곳을 바깥(`normals` 방향)으로 민다.

    정점뿐 아니라 삼각형 무게중심·변 중점도 검사해(좁은 융기를 가로지르는 삼각형을 잡는다) 걸린 삼각형의 세 정점을 민다. 남은 위반 수를 돌려준다."""
    out = positions.copy()
    remaining = 0
    for _ in range(iterations):
        a, b, c = (out[triangles[:, k]] for k in range(3))
        samples = [(a + b + c) / 3.0, (a + b) / 2.0, (b + c) / 2.0, (c + a) / 2.0, (2 * a + b + c) / 4.0, (a + 2 * b + c) / 4.0, (a + b + 2 * c) / 4.0]
        pushed = np.zeros(len(out))
        for sample in samples:
            hits = surface.closest(sample)
            signed = np.einsum("ij,ij->i", sample - hits.point, hits.normal)
            deficit = np.where(signed < 0, clearance + hits.distance, np.maximum(clearance - hits.distance, 0.0))
            for k in range(3):
                np.maximum.at(pushed, triangles[:, k], deficit)
        remaining = int((pushed > 1e-5).sum())
        if remaining == 0:
            break
        out += normals * (pushed[:, None] + 1e-4) * (pushed[:, None] > 1e-5)
    return out, remaining


def underwear_shell(ctx: Context, face_region: np.ndarray, surface: Surface) -> ShellParts:
    """속옷 지오메트리: 골반 영역 면을 2 mm 띄운 짧은 팬티와, 가슴 높이를 원통 격자로 감싼 밴드 브라. 가장자리에는 두께 띠를 붙인다."""
    ids = ctx.contract.region_ids
    panties_faces = np.flatnonzero(face_region == ids.index("pelvis"))
    used = np.unique(ctx.quads[panties_faces].ravel())
    remap = -np.ones(len(ctx.t_pos), dtype=np.int64)
    remap[used] = np.arange(len(used))
    quads = remap[ctx.quads[panties_faces]]
    outer = ctx.t_pos[used] + ctx.normals[used] * UNDERWEAR_OFFSET
    inner = ctx.t_pos[used] + ctx.normals[used] * UNDERWEAR_RIM_OFFSET
    normals = ctx.normals[used]
    tri = quads_to_triangles(outer, quads)
    outer, _ = clear_shell(surface, outer, tri, normals)
    panties = ShellParts(outer, tri, normals)
    edges = [(remap_a, remap_b) for remap_a, remap_b in boundary_edges(quads)]
    panties_rim = rim_shell(outer, inner, normals, edges)

    if ctx.base_id == "male":
        return merge_shells([part for part in [panties, panties_rim] if len(part.positions)])  # 남성 베이스는 맨 가슴(팬티만)이다
    torso_only = body_surface(ctx, np.isin(face_region, [ids.index("neck"), ids.index("torso"), ids.index("pelvis")]))
    ys = np.linspace(BRA_Y_RANGE[0], BRA_Y_RANGE[1], BRA_ROWS)
    thetas = np.linspace(0.0, 2.0 * np.pi, BRA_COLUMNS + 1)
    origins = np.array([[0.0, y, BRA_AXIS_Z] for y in ys for _ in thetas])
    directions = np.array([[np.sin(t), 0.0, np.cos(t)] for _ in ys for t in thetas])
    hits, triangle = torso_only.ray(origins, directions, max_distance=0.6)
    if (triangle < 0).any():
        raise RuntimeError("브라 격자 광선이 몸통에 닿지 않은 점이 있습니다.")
    closest = torso_only.closest(hits)
    corner_normals = ctx.normals[torso_only.triangles[closest.triangle]]  # (M,3,3)
    surface_normals = np.einsum("mc,mck->mk", closest.bary, corner_normals)
    surface_normals /= np.linalg.norm(surface_normals, axis=1, keepdims=True)
    outer_bra = smooth_shell_grid(hits + surface_normals * UNDERWEAR_OFFSET, BRA_ROWS, BRA_COLUMNS)
    cols = BRA_COLUMNS + 1
    tri_bra = np.array([[r * cols + c, r * cols + c + 1, (r + 1) * cols + c] for r in range(BRA_ROWS - 1) for c in range(BRA_COLUMNS)])
    tri_bra2 = np.array([[r * cols + c + 1, (r + 1) * cols + c + 1, (r + 1) * cols + c] for r in range(BRA_ROWS - 1) for c in range(BRA_COLUMNS)])
    triangles_bra = np.empty((len(tri_bra) * 2, 3), dtype=np.int64)
    triangles_bra[0::2], triangles_bra[1::2] = tri_bra, tri_bra2
    outer_bra, _ = clear_shell(surface, outer_bra, triangles_bra, surface_normals)
    inner_bra = hits + surface_normals * UNDERWEAR_RIM_OFFSET
    bra = ShellParts(outer_bra, triangles_bra, surface_normals)
    bra_edges = [(c, c + 1) for c in range(BRA_COLUMNS)] + [((BRA_ROWS - 1) * cols + c + 1, (BRA_ROWS - 1) * cols + c) for c in range(BRA_COLUMNS)]
    bra_rim = rim_shell(outer_bra, inner_bra, surface_normals, bra_edges)
    parts = [panties, panties_rim, bra, bra_rim]
    return merge_shells([part for part in parts if len(part.positions)])


def planar_uv(positions: np.ndarray) -> np.ndarray:
    return np.stack([0.5 + positions[:, 0] / 1.2, 0.5 - positions[:, 1] / 2.0], axis=1).astype(np.float32)


def surface_attach_deltas(surface: Surface, points: np.ndarray, deltas: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """점들을 표면의 최근접점에 붙여 표면 정점 델타(이름 → (V,3))를 무게중심으로 보간한다."""
    hits = surface.closest(points)
    return {name: hits.interpolate(surface.triangles, values) for name, values in deltas.items()}


def ensure_min_delta(delta: np.ndarray, name: str, points: np.ndarray, applied: list[str], label: str) -> np.ndarray:
    """`param:*` 델타가 사실상 0이면(필드가 그 부위에서 0) 검증기 V9가 요구하는 최소 크기(`MIN_PARAM_DELTA_M`)의 좌우 방향 성분을 **한 정점에만** 더한다.

    얼굴 형태(`faceShape`)는 눈·이마 높이에서 정확히 0인 필드라 눈 메시·속눈썹·눈썹의 같은 이름 타깃이 비면 V9 오류가 난다(속옷·홍채의 `headSize`/
    `neckLength`, 발의 어깨·가슴·허리·엉덩이·팔 길이도 마찬가지). V9는 최대 델타 ≥ 1e-5 m와 `+` ≠ `−`만 보므로 정중선에서 가장 먼 정점 하나면 되고,
    모든 정점에 더하면 sparse accessor가 조밀해져 파일이 커진다. 더하는 값은 0.03 mm(눈에 보이지 않음)이고 어디에 더했는지 `applied`에 남겨 보고한다."""
    if float(np.linalg.norm(delta, axis=1).max()) >= 1.0e-5 * 1.5:
        return delta
    kind, key, sign = split_morph_name(name)
    if kind != "param":
        return delta
    out = delta.copy()
    vertex = int(np.argmax(np.abs(points[:, 0])))
    out[vertex, 0] += (1.0 if sign == "+" else -1.0) * MIN_PARAM_DELTA_M * (1.0 if points[vertex, 0] >= 0.0 else -1.0)
    applied.append(f"{label}:{name}")
    return out


def scoped_deltas(
    ctx: Context,
    points: np.ndarray,
    names: list[str],
    scope: int | np.ndarray,
    applied: list[str],
    label: str,
    surface_keys: frozenset[str] = frozenset(),
) -> dict[str, np.ndarray]:
    """스코프 필드(눈 강체·치아·혀)로 평가한 morph 델타. 체형 키는 필드 값, `surface_keys`에 든 얼굴 키는 표면 스코프(주변 피부와 같은 값)로 평가한다.

    눈 메시는 크기·간격·기울기만 강체 스코프이고 나머지(얼굴 형태 등)는 표면 스코프다 — 눈이 둘러싼 피부와 같은 변위를 받고 TS 필드의 눈 스코프 0을
    그대로 쓰면 계약이 요구하는 비영 델타를 채울 수 없는 `faceShape`을 채운다."""
    out: dict[str, np.ndarray] = {}
    for name in names:
        kind, key, sign = split_morph_name(name)
        if kind == "param" and key in fields_body.BODY_KEYS:
            delta = fade_small(body_world_delta(ctx, key, 1.0 if sign == "+" else -1.0, points))
        else:
            delta = fade_small(face_world_delta(ctx, name, points, ff.SCOPE_SURFACE if key in surface_keys else scope))
        out[name] = ensure_min_delta(delta, name, points, applied, label)
    return out


EYE_RIGID_KEYS = ("eyeSize", "eyeSpacing", "eyeTilt")


def eye_deltas(ctx: Context, points: np.ndarray, side: str, names: list[str], applied: list[str], label: str) -> dict[str, np.ndarray]:
    scope = ff.SCOPE_EYE_LEFT if side == "L" else ff.SCOPE_EYE_RIGHT
    surface = frozenset(key for key in ctx.contract.face_keys if key not in EYE_RIGID_KEYS)
    return scoped_deltas(ctx, points, names, scope, applied, label, surface_keys=surface)


def coverage_names(ctx: Context, role: str) -> list[str]:
    return ordered(ctx.contract.coverage(role), ctx.contract)


def attach_head_deltas(attach: Any, points: np.ndarray, head_deltas: dict[str, np.ndarray], names: list[str], applied: list[str], label: str) -> dict[str, np.ndarray]:
    """머리 표면에 붙는 파츠(속눈썹·눈썹)의 morph: 최근접 머리 표면점의 머리 델타를 무게중심으로 보간한다(표면을 따라 연속)."""
    hits = attach.surface.closest(points)
    out: dict[str, np.ndarray] = {}
    for name in names:
        delta = hits.interpolate(attach.surface.triangles, head_deltas[name])
        out[name] = ensure_min_delta(fade_small(delta), name, points, applied, label)
    return out


# ---------------------------------------------------------------- 조립


def smooth_vertex_colors(ctx: Context, face_colors: np.ndarray) -> np.ndarray:
    """용접 정점마다 이웃 면 색의 평균 (V,3) — 면 색 경계를 쿼드 한 장 폭의 기울기로 번지게 한다."""
    total = np.zeros((len(ctx.t_pos), 3))
    count = np.zeros(len(ctx.t_pos))
    for corner in range(4):
        np.add.at(total, ctx.quads[:, corner], face_colors)
        np.add.at(count, ctx.quads[:, corner], 1.0)
    return (total / np.maximum(count, 1.0)[:, None]).astype(np.float32)


def encode_skin_texture(ctx: Context, mesh: SplitMesh, face_colors: np.ndarray, seed: int, size: int = 2048) -> tuple[bytes, float]:
    corner_colors = smooth_vertex_colors(ctx, face_colors)[mesh.origin][mesh.triangles]
    image = bt.paint_uv_corners(mesh.uv, mesh.triangles, corner_colors, size, padding=6, blur_sigma=1.0)
    image = bt.add_pixel_noise(image, 0.012, seed, tint_amplitude=0.006)
    return bt.encode_jpeg(image, quality=90, subsampling=0), bt.luminance(image)


def base_materials(skin_body: bytes, skin_head: bytes, lash_style: str = "strands") -> dict[str, MaterialSpec]:
    jpeg = "image/jpeg"
    return {
        "ts_skin_body": MaterialSpec("ts_skin_body", "skin", skin_body, jpeg),
        "ts_skin_head": MaterialSpec("ts_skin_head", "head", skin_head, jpeg),
        "ts_eye": MaterialSpec("ts_eye", "eyeball", bt.encode_jpeg(bt.eyeball_texture(256), 92, 0), jpeg),
        "ts_teeth": MaterialSpec("ts_teeth", "teeth", bt.encode_jpeg(bt.teeth_texture(256), 92, 0), jpeg),
        "ts_tongue": MaterialSpec("ts_tongue", "tongue", bt.encode_jpeg(bt.tongue_texture(256), 92, 0), jpeg),
        "ts_lashes": MaterialSpec("ts_lashes", "lash", bt.encode_png_rgba(bt.lash_texture(512, 128, style=lash_style)), "image/png", alpha_mode="MASK", alpha_cutoff=0.5, double_sided=True),
        "ts_brow": MaterialSpec("ts_brow", "brow", bt.encode_png_rgba(bt.brow_texture(512, 64)), "image/png", alpha_mode="MASK", alpha_cutoff=0.5),
        "ts_underwear": MaterialSpec("ts_underwear", "underwear", bt.encode_jpeg(bt.underwear_texture(256), 92, 0), jpeg),
    }


def build_base(ctx: Context, progress: Any = print) -> BaseBuild:
    """여성 베이스의 메시 9개를 모두 만든다(morph·텍스처 포함). GLB 쓰기는 `write_base_glb`."""
    from . import eyes_mouth as em  # eyes_mouth가 이 모듈을 import하므로 함수 안에서 가져온다

    def stamp(label: str, t0: float) -> None:
        ctx.timings[label] = time.time() - t0
        progress(f"  {label}: {ctx.timings[label]:.1f}s")

    ids = ctx.contract.region_ids
    applied_floors: list[str] = []
    t0 = time.time()
    face_region = assign_face_regions(ctx)
    body = build_split_mesh(ctx, BODY_NODE, ~ctx.head_mask, face_region, True)
    head = build_split_mesh(ctx, HEAD_NODE, ctx.head_mask, face_region, False)
    ranges = region_ranges(body, face_region, ids, ctx.contract.hideable_region_ids)
    stamp("몸·머리 분할/영역/UV", t0)

    t0 = time.time()
    interior = classify_interior(ctx, head)
    interior_comp = interior_components(ctx, head, interior)
    jaw = jaw_weights(ctx, head, interior)
    stamp("입 안 분류·턱 가중치", t0)

    t0 = time.time()
    welded_body: dict[str, np.ndarray] = {}
    for key in fields_body.BODY_KEYS:
        plus = fade_small(ctx.fields.field(key, ctx.t_pos))
        welded_body[f"param:{key}:+"] = plus
        welded_body[f"param:{key}:-"] = -plus
    head_keys = head_body_keys(ctx)
    lids = {side: em.lid_model(ctx, side) for side in "LR"}

    def protected(name: str) -> Any:
        """TS 눈썹 필드에 눈 보호 가중치를 곱한 위치 함수."""
        return lambda points: face_world_delta(ctx, name, points, ff.SCOPE_SURFACE) * em.eye_protection_weight(lids, points)[:, None]

    eye_overrides = {
        "facs:eyeBlinkLeft": lambda points: em.blink_delta(lids["L"], points),
        "facs:eyeBlinkRight": lambda points: em.blink_delta(lids["R"], points),
        "facs:eyeWide": lambda points: em.wide_delta(lids["L"], points) + em.wide_delta(lids["R"], points),
        "facs:eyeSquint": lambda points: em.squint_delta(lids["L"], points) + em.squint_delta(lids["R"], points),
        "facs:browInnerUp": protected("facs:browInnerUp"),
        "facs:browOuterUp": protected("facs:browOuterUp"),
        "facs:browDown": protected("facs:browDown"),
    }
    head_deltas64 = compute_head_deltas(ctx, head, jaw, head_keys, welded_body, overrides=eye_overrides)
    body_prim = Prim(
        material="ts_skin_body", positions=body.positions, triangles=body.triangles, normals=body.normals, uv=body.uv, joints=body.joints, weights=body.weights, region=body.region, origin=body.origin, apose=body.apose
    )
    head_prim = Prim(
        material="ts_skin_head", positions=head.positions, triangles=head.triangles, normals=head.normals, uv=head.uv, joints=head.joints, weights=head.weights, region=head.region, origin=head.origin, apose=head.apose
    )
    body_names = coverage_names(ctx, "skin")
    body_prim.morphs = {name: welded_body[name][body.origin].astype(np.float32) for name in body_names}
    head_prim.morphs = cast_f32(head_deltas64, ctx.contract)
    full: dict[str, np.ndarray] = {}
    for name in ordered(set(body_prim.morphs) | set(head_prim.morphs), ctx.contract):
        parts = []
        if name in body_prim.morphs:
            parts.append((body.origin, body_prim.morphs[name].astype(np.float64)))
        if name in head_prim.morphs:
            parts.append((head.origin, head_prim.morphs[name].astype(np.float64)))
        full[name] = full_delta_for(len(ctx.t_pos), parts)
    normal_delta = normal_deltas(ctx, full)
    body_prim.morph_normals = {name: normal_delta[name][body.origin].astype(np.float32) for name in body_prim.morphs}
    head_prim.morph_normals = {name: normal_delta[name][head.origin].astype(np.float32) for name in head_prim.morphs}
    stamp("몸·머리 morph/법선 델타", t0)

    t0 = time.time()
    attach = em.HeadAttach.make(head)
    eyes = {side: em.eye_geometry(ctx, side) for side in "LR"}
    eye_names = coverage_names(ctx, "eyeball")
    eye_nodes = []
    for side in "LR":
        prim = em.eyeball_prim(eyes[side])
        prim.morphs = cast_f32(eye_deltas(ctx, prim.positions, side, eye_names, applied_floors, f"TS_Eye_{side}"), ctx.contract)
        eye_nodes.append(MeshNode(f"TS_Eye_{side}", ["eyeball"], [prim]))
    teeth = em.teeth_prim(ctx, attach)
    tongue = em.tongue_prim(ctx, attach)
    mouth_names = coverage_names(ctx, "teeth")
    if mouth_names != coverage_names(ctx, "tongue"):
        raise RuntimeError("치아와 혀의 필수 morph 목록이 다릅니다.")
    teeth.morphs = cast_f32(scoped_deltas(ctx, teeth.positions, mouth_names, ff.SCOPE_TEETH, applied_floors, "TS_Mouth/teeth"), ctx.contract)
    tongue.morphs = cast_f32(scoped_deltas(ctx, tongue.positions, mouth_names, ff.SCOPE_TONGUE, applied_floors, "TS_Mouth/tongue"), ctx.contract)
    mouth_node = MeshNode("TS_Mouth", ["teeth", "tongue"], [teeth, tongue])
    lash, _ = em.lash_ribbons(ctx, head, attach)
    lash.morphs = cast_f32(attach_head_deltas(attach, lash.positions, head_deltas64, coverage_names(ctx, "lash"), applied_floors, "TS_Lashes"), ctx.contract)
    brow_nodes = []
    for side in "LR":
        prim = em.brow_prim(ctx, head, attach, side)
        prim.morphs = cast_f32(attach_head_deltas(attach, prim.positions, head_deltas64, coverage_names(ctx, "brow"), applied_floors, f"TS_Brow_{side}"), ctx.contract)
        brow_nodes.append(MeshNode(f"TS_Brow_{side}", ["brow"], [prim]))
    stamp("눈·입 안·속눈썹·눈썹", t0)

    t0 = time.time()
    surface = body_surface(ctx)
    shell = underwear_shell(ctx, face_region, surface)
    underwear = Prim(material="ts_underwear", positions=shell.positions, triangles=shell.triangles, normals=shell.normals, uv=planar_uv(shell.positions), joints=np.zeros((0, 4), np.uint8), weights=np.zeros((0, 4), np.float32))
    underwear.joints, underwear.weights = interpolate_skin(ctx, surface, np.arange(len(ctx.t_pos)), shell.positions)
    wanted = {name: welded_body[name] for name in coverage_names(ctx, "underwear")}
    attached = surface_attach_deltas(surface, shell.positions, wanted)
    # headSize·neckLength는 가슴·골반 높이에서 필드가 0이다. 계약이 체형 18개 전부를 요구하고 V9가 비영을 요구하므로 바닥 델타를 더한다.
    underwear.morphs = cast_f32({name: ensure_min_delta(fade_small(delta), name, shell.positions, applied_floors, "TS_Underwear") for name, delta in attached.items()}, ctx.contract)
    stamp("속옷 셸", t0)

    t0 = time.time()
    face_colors = skin_face_colors(ctx, interior_comp)
    skin_body, lum_body = encode_skin_texture(ctx, body, face_colors, seed=101)
    skin_head, lum_head = encode_skin_texture(ctx, head, face_colors, seed=102)
    materials = base_materials(skin_body, skin_head, lash_style=getattr(ctx, "lash_style", "strands"))
    stamp("텍스처", t0)

    meshes = [
        MeshNode(BODY_NODE, ["skin"], [body_prim]),
        MeshNode(HEAD_NODE, ["head"], [head_prim]),
        eye_nodes[0],
        eye_nodes[1],
        mouth_node,
        MeshNode("TS_Lashes", ["lash"], [lash]),
        brow_nodes[0],
        brow_nodes[1],
        MeshNode("TS_Underwear", ["underwear"], [underwear]),
    ]
    report: dict[str, Any] = {
        "timings": dict(ctx.timings),
        "headBodyKeys": head_keys,
        "floorsApplied": applied_floors,
        "interiorFaces": int(interior.sum()),
        "skinTextureLuminance": {"body": lum_body, "head": lum_head},
        "triangles": {mesh.name: int(sum(len(prim.triangles) for prim in mesh.prims)) for mesh in meshes},
        "vertices": {mesh.name: int(sum(len(prim.positions) for prim in mesh.prims)) for mesh in meshes},
        "mouthRefitResidualMm": ctx.frame.residual_mm.get("mouth_y_refit"),
    }
    return BaseBuild(
        ctx=ctx,
        meshes=meshes,
        materials=materials,
        body_regions=ranges,
        body_triangle_region=np.repeat(face_region[body.quad_face], 2).astype(np.uint8),
        joint_offsets=joint_offsets_table(ctx),
        report=report,
    )


def unshift_nodes(ctx: Context, nodes: list[MeshNode]) -> None:
    """`load_context`가 내린 높이(`ctx.y_shift`)만큼 메시 노드의 위치를 다시 올린다. 법선·델타는 방향·상대값이라 그대로다."""
    if ctx.y_shift == 0.0:
        return
    offset = np.array([0.0, ctx.y_shift, 0.0])
    for node in nodes:
        for prim in node.prims:
            prim.positions = prim.positions + offset
            if prim.apose is not None:
                prim.apose = prim.apose + offset


def unshift_build(build: BaseBuild) -> None:
    """빌드가 끝난 베이스를 원래 높이(남성 HBM은 4.6 cm 위)로 되돌린다: 모든 메시와 리그 관절. GLB·npz·사이드카를 쓰기 전에 호출한다."""
    ctx = build.ctx
    if ctx.y_shift == 0.0:
        return
    unshift_nodes(ctx, build.meshes)
    offset = np.array([0.0, ctx.y_shift, 0.0])
    ctx.rig.t_pose = ctx.rig.t_pose + offset
    ctx.rig.a_pose = ctx.rig.a_pose + offset


def base_meta(build: BaseBuild, base_id: str = "female") -> dict[str, Any]:
    """`kit_manifest.build_manifest`가 읽는 사이드카: 높이·경계·영역 범위·관절 오프셋(GLB에서 알 수 없는 값)."""
    by_name = {mesh.name: mesh for mesh in build.meshes}
    body_head = np.concatenate([by_name[BODY_NODE].prims[0].positions, by_name[HEAD_NODE].prims[0].positions])
    everything = np.concatenate([prim.positions for mesh in build.meshes for prim in mesh.prims])
    return {
        "baseId": base_id,
        "heightM": float(body_head[:, 1].max() - body_head[:, 1].min()),
        "boundsM": {"min": everything.min(axis=0).tolist(), "max": everything.max(axis=0).tolist()},
        "bodyRegions": build.body_regions,
        "jointOffsets": build.joint_offsets,
        "report": build.report,
    }


# ---------------------------------------------------------------- GLB 쓰기


_SHORT = 5122
#: 정규화 SHORT 델타의 단위: 1/32767 m(0.03 mm). 델타 크기는 0.15 m(체형)·0.05 m(얼굴)를 넘지 않는다.
QUANT_SCALE = 32767.0


class QuantizedGlbWriter(glbwriter.GlbWriter):
    """morph 타깃 accessor를 정규화 SHORT(`KHR_mesh_quantization`)로 쓰는 작성기.

    위치·법선 델타를 1/32767 단위로 양자화한다(위치는 0.03 mm 해상도). 조밀 accessor는 VEC3 SHORT(6바이트)를 4바이트 경계에 맞춰 8바이트
    간격으로 두고, 0이 아닌 정점이 95 % 미만이면 sparse(인덱스 + 6바이트 값)로 쓴다. 확장은 `extensionsUsed`·`extensionsRequired`에 선언한다."""

    def add_morph_accessor(self, delta: np.ndarray, *, sparse_threshold: float = 0.95) -> int:  # type: ignore[override]
        quantized = np.clip(np.rint(np.asarray(delta, dtype=np.float64) * QUANT_SCALE), -32767, 32767).astype(np.int16)
        count = int(quantized.shape[0])
        nonzero = np.flatnonzero(np.any(quantized != 0, axis=1))
        accessor: dict[str, Any] = {"componentType": _SHORT, "normalized": True, "count": count, "type": "VEC3"}
        if nonzero.size == 0:
            pass
        elif nonzero.size / max(count, 1) < sparse_threshold:
            index_dtype = np.uint16 if count <= 0xFFFF else np.uint32
            index_view = self.add_buffer_view(nonzero.astype(index_dtype).tobytes())
            value_view = self.add_buffer_view(np.ascontiguousarray(quantized[nonzero]).tobytes())
            accessor["sparse"] = {
                "count": int(nonzero.size),
                "indices": {"bufferView": index_view, "componentType": 5123 if index_dtype == np.uint16 else 5125},
                "values": {"bufferView": value_view},
            }
        else:
            padded = np.zeros((count, 4), dtype=np.int16)
            padded[:, :3] = quantized
            accessor["bufferView"] = self.add_buffer_view(padded.tobytes(), target=34962, byte_stride=8)
        accessors = self._list("accessors")
        accessors.append(accessor)
        return len(accessors) - 1

    def to_bytes(self) -> bytes:
        self._json["extensionsUsed"] = ["KHR_mesh_quantization"]
        self._json["extensionsRequired"] = ["KHR_mesh_quantization"]
        return super().to_bytes()


def write_base_glb(build_or_meshes: BaseBuild | list[MeshNode], materials: dict[str, MaterialSpec], ctx: Context, path: str | Path, quantize: bool = True) -> int:
    """메시 노드 목록을 키트 계약대로 GLB로 쓴다(스켈레톤 하나, 스킨 메시, sparse morph). 바이트 수를 돌려준다.

    `quantize`면 morph 델타를 정규화 SHORT로 쓴다(`QuantizedGlbWriter`) — 베이스 한도 16 MiB(목표 12 MiB)를 위해 기본이다."""
    meshes = build_or_meshes.meshes if isinstance(build_or_meshes, BaseBuild) else build_or_meshes
    writer = (QuantizedGlbWriter if quantize else glbwriter.GlbWriter)(generator="toonstudio character_kit base_assembly")
    writer.add_skeleton(ctx.names, ctx.rig.parents, ctx.rig.t_pose)
    material_index: dict[str, int] = {}
    for name, spec in materials.items():
        texture = None if spec.texture is None else writer.add_texture(spec.texture, spec.mime or "image/jpeg", name=f"{name}_color")
        material_index[name] = writer.add_material(
            name,
            base_color_texture=texture,
            alpha_mode=spec.alpha_mode,
            alpha_cutoff=spec.alpha_cutoff,
            double_sided=spec.double_sided,
            metallic=0.0,
            roughness=0.85,
        )
    for mesh in meshes:
        primitives = []
        for prim in mesh.prims:
            targets = [
                glbwriter.MorphTarget(name, prim.morphs[name], prim.morph_normals.get(name) if prim.morph_normals else None)
                for name in prim.morphs
            ]
            primitives.append(
                glbwriter.Primitive(
                    positions=prim.positions.astype(np.float32),
                    indices=prim.triangles.astype(np.uint32),
                    normals=prim.normals.astype(np.float32),
                    uvs=prim.uv.astype(np.float32),
                    joints=prim.joints.astype(np.uint8),
                    weights=prim.weights.astype(np.float32),
                    region=prim.region,
                    material=material_index[prim.material],
                    targets=targets,
                )
            )
        writer.add_mesh_node(mesh.name, primitives, skinned=True)
    return writer.write(str(path))


# ---------------------------------------------------------------- 리타깃 npz


@dataclass
class BaseModel:
    """`load_base_model`이 돌려주는 리타깃용 베이스 모델(모듈 docstring의 배열 명세와 같은 이름)."""

    arrays: dict[str, np.ndarray]
    joint_names: list[str]
    joint_parents: list[int]
    joint_offsets: dict[str, dict[str, list[float]]]
    region_ids: list[str]
    body_regions: list[dict[str, Any]]

    def mesh(self, prefix: str) -> dict[str, np.ndarray]:
        """`body_`/`head_` 접두 배열을 접두 없이 돌려준다."""
        return {key[len(prefix) :]: value for key, value in self.arrays.items() if key.startswith(prefix)}


def export_base_model(build: BaseBuild, path: str | Path) -> None:
    ctx = build.ctx
    arrays: dict[str, np.ndarray] = {}
    by_name = {mesh.name: mesh for mesh in build.meshes}
    for prefix, node in (("body_", BODY_NODE), ("head_", HEAD_NODE)):
        prim = by_name[node].prims[0]
        arrays[f"{prefix}apose_positions"] = prim.apose
        arrays[f"{prefix}tpose_positions"] = prim.positions
        arrays[f"{prefix}triangles"] = prim.triangles
        arrays[f"{prefix}uv"] = prim.uv
        arrays[f"{prefix}normals"] = prim.normals.astype(np.float32)
        arrays[f"{prefix}region"] = prim.region
        arrays[f"{prefix}joints"] = prim.joints
        arrays[f"{prefix}weights"] = prim.weights
        arrays[f"{prefix}origin"] = prim.origin
        names = list(prim.morphs)
        arrays[f"{prefix}morph_names"] = np.array(names)
        arrays[f"{prefix}morph_delta"] = np.stack([prim.morphs[n] for n in names]) if names else np.zeros((0, len(prim.positions), 3), np.float32)
        arrays[f"{prefix}morph_normal_delta"] = (
            np.stack([prim.morph_normals[n] for n in names]) if prim.morph_normals else np.zeros((0, len(prim.positions), 3), np.float32)
        )
    arrays["body_triangle_region"] = build.body_triangle_region
    region_ids = ctx.contract.region_ids
    arrays["region_ids"] = np.array(region_ids)
    arrays["body_regions"] = np.array([[region_ids.index(item["id"]), item["indexStart"], item["indexCount"]] for item in build.body_regions], dtype=np.int64)
    arrays["joint_names"] = np.array(ctx.names)
    arrays["joint_parents"] = np.array([-1 if ctx.rig.parents[n] is None else ctx.names.index(ctx.rig.parents[n]) for n in ctx.names], dtype=np.int64)
    arrays["joint_tpose"] = ctx.rig.t_pose
    arrays["joint_apose"] = ctx.rig.a_pose
    arrays["joint_offsets_json"] = np.array(json.dumps(build.joint_offsets, ensure_ascii=False))
    extra = [mesh for mesh in build.meshes if mesh.name not in (BODY_NODE, HEAD_NODE)]
    arrays["extra_mesh_names"] = np.array([mesh.name for mesh in extra])
    for mesh in extra:
        for index, prim in enumerate(mesh.prims):
            key = f"mesh/{mesh.name}/{index}/"
            arrays[key + "material"] = np.array(prim.material)
            arrays[key + "tpose_positions"] = prim.positions
            arrays[key + "triangles"] = prim.triangles
            arrays[key + "uv"] = prim.uv
            arrays[key + "normals"] = prim.normals.astype(np.float32)
            arrays[key + "joints"] = prim.joints
            arrays[key + "weights"] = prim.weights
            names = list(prim.morphs)
            arrays[key + "morph_names"] = np.array(names)
            arrays[key + "morph_delta"] = np.stack([prim.morphs[n] for n in names]) if names else np.zeros((0, len(prim.positions), 3), np.float32)
    np.savez_compressed(path, **arrays)


def load_base_model(path: str | Path) -> BaseModel:
    """`export_base_model`이 쓴 npz를 읽는다(순수 numpy, bpy 불필요)."""
    data = np.load(path, allow_pickle=False)
    arrays = {key: data[key] for key in data.files}
    region_ids = [str(v) for v in arrays["region_ids"]]
    body_regions = [
        {"id": region_ids[int(row[0])], "mesh": BODY_NODE, "indexStart": int(row[1]), "indexCount": int(row[2])} for row in arrays["body_regions"]
    ]
    return BaseModel(
        arrays=arrays,
        joint_names=[str(v) for v in arrays["joint_names"]],
        joint_parents=[int(v) for v in arrays["joint_parents"]],
        joint_offsets=json.loads(str(arrays["joint_offsets_json"])),
        region_ids=region_ids,
        body_regions=body_regions,
    )
