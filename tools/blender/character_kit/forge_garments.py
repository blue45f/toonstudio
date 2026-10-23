"""상의·하의·아우터를 이 저장소가 직접 만드는 원본 의상 생성기 (license original, provenance toonstudio-original).

Hyper3D 파생 의상(2026-10-14/15 권리 증빙 부족으로 제외)을 대신해 현재 계약의 상의 5종(tee·hoodie·shirt·blazer·sailor)과 하의 5종
(jeans·shorts·pleated-skirt·long-skirt·slacks)을 두 베이스(female=webtoon-girl, male=webtoon-boy)에 맞춰 절차적으로 만든다. 겹쳐 입기 제안으로
아우터 레이어(blazer·hoodie·cardigan·vest)를 더한다. 외부 생성 AI 산출물·경쟁 도구 에셋을 쓰지 않는다. 입력은 베이스 리타깃 npz(`base_assembly.load_base_model`)뿐이다.

설계(모두 T-포즈 베이스 좌표, m, Y 위, +Z 앞, 캐릭터 왼쪽 +X)
--------------------------------------------------------------
1. **몸 표면 오프셋 셸**(`build_body_shell` → `relax_shell`): 베이스 몸(용접한 TS_Body)에서 영역·높이로 고른 면을 여유(ease)만큼 법선으로 부풀린 뒤
   Taubin 평활 + 몸과의 최소 거리(`d_lo`) + 최대 거리(`d_hi`) + 아래 레이어 제약을 번갈아 걸어 몸의 오목한 곳(가슴 밑·겨드랑이·허리 뒤)을 천처럼 건너뛴다.
   몸통은 `drape_envelope`(위에서 아래로 내려오는 천의 기울기 한계)로 가슴·견갑골에서 곧게 떨어지게 하고, 바지는 다리 축을 따라 같은 처리를 한다.
2. **축소**(`decimate`, bpy Decimate Collapse + X 대칭): 셸을 파츠 예산(파일 ≤ 1.5 MiB, 삼각형 ≤ 25k)에 맞는 밀도로 줄인다.
3. **레벨셋 절단**(`cut_mesh`): 밑단·소매 끝·허리선은 스칼라장의 0 등위선, 목둘레는 셸 목 관 윗단에서의 표면 거리(`geodesic_neck_field`, V넥 포함)로 자른다.
   같은 함수로 띠(립·밑단 띠·커프스·허리띠)의 경계 고리와 판 솔기(`split_panels`)도 넣는다.
4. **가장자리 마감**(`band_split`·`add_fold`): 띠를 몸 바깥으로 살짝 띄워 단차를 만들고, 열린 가장자리마다 안쪽으로 접힌 두께 단을 붙인다.
5. **디테일**: 두께 판(`solidify_grid`)으로 만든 셔츠 칼라(스탠드·접힘·날개)·블레이저 라펠/칼라·세일러 칼라·후드(테두리 + 등 주머니), 플래킷·단추,
   주머니(`surface_patch`), 리본·스카프(`ribbon_bow`, 날개 + 제비꼬리), 넥타이, 벨트 고리, 드로스트링, 줄무늬·파이핑(`ribbon`),
   칼주름 치마(`skirt_columns`, 주름 수·깊이, 봉우리·골에서 법선을 가른 실제 형상), A라인 롱스커트 — 모두 셸 위에 얹는 입체다.
6. **겹쳐 입기**: 레이어 0 이너 · 1 상의/하의 · 2 아우터. 상의 밑단은 하의 허리선보다 `TOP_BOTTOM_OVERLAP_M` 아래(하의 바깥 경계 `lower_torso` 밖),
   하의 허리선은 속옷 윗선 + `UNDERWEAR_COVER_M` 위, 아우터는 레이어 1 상의·하의 표면 바깥(`surface_push_constraint`)에 얹힌다.
7. **스킨·morph**(`assemble`): 셸은 법선이 호환되는 가까운 몸 정점의 웨이트(`garment_fit.compatible_vertex_skin`)와 검증기 V9와 같은 대응
   (`retarget_garment.nearest_body_reference`)의 체형 morph 18개를 받는다. 디테일은 얹힌 셸 점의 값을 무게중심으로 이어받아 셸과 같이 움직인다.
   치마는 허리(골반)에서 허벅지로 섞이는 웨이트를 직접 짠다(다리 사이에서 찢어지지 않게).
8. **커스터마이즈**: 조각마다 색 역할(`main`·`trim`·`accent` → 다역할 변형의 top/top-trim/top-accent, bottom/bottom-trim, outer/…),
   형태 키 `shape:<이름>:±`(기장·품·소매·칼라·퍼짐·주름·밑위·허리 핏 등, 끝값도 몸·아래 레이어 밖에 머물게 `finalize_shape_delta`),
   TEXCOORD_1(월드 축척 UV, 1 = 1 m — 셰이더 무늬 좌표).
9. **텍스처·UV**: 판 솔기를 이음매로 한 각도 기반 전개(ABF) → 월드 축척 섬(TEXCOORD_1) → 아틀라스 패킹(TEXCOORD_0). 텍셀마다 3D 위치를 보간해 솔기·스티치·립·
   데님/능직/니트 결·단추 구멍을 절차로 굽는다(상대 밝기, 평균 휘도 ≥ 0.80). compat(한 재질)은 역할별 상대 밝기로 트림·액센트를 구분한다.

계약(현재, compat 변형): 메시 `TS_Top_<이름>`/`TS_Bottom_<이름>`, 재질 `ts_top_<이름>`/`ts_bottom_<이름>`(양면, recolor), 68 joint 스킨
(WEIGHTS_0 정규화 UNSIGNED_SHORT), 체형 morph 18(±), 삼각형 ≤ 25,000, 파일 ≤ 1.5 MiB, 텍스처 ≤ 1024² JPEG. 다역할 변형(`layered`)은 제안 형식이다.
결정적이다(난수는 고정 시드).
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np

from character_kit import garment_fit as gf
from character_kit.surface import Surface, barycentric, vertex_normals

# ---------------------------------------------------------------- 메시 기본 연산


@dataclass
class Mesh:
    """삼각형 메시 + 정점별 속성(`attrs`, 첫 축 = 정점). 실수 속성은 절단 시 선형 보간, 정수 속성은 가까운 쪽 값을 받는다."""

    positions: np.ndarray
    triangles: np.ndarray
    attrs: dict[str, np.ndarray] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.positions = np.asarray(self.positions, dtype=np.float64).reshape(-1, 3)
        self.triangles = np.asarray(self.triangles, dtype=np.int64).reshape(-1, 3)

    @property
    def count(self) -> int:
        return len(self.positions)

    def copy(self) -> "Mesh":
        return Mesh(self.positions.copy(), self.triangles.copy(), {k: v.copy() for k, v in self.attrs.items()})

    def with_attr(self, name: str, value: Any) -> "Mesh":
        out = self.copy()
        if np.ndim(value) == 0:
            out.attrs[name] = np.full(self.count, value)
        else:
            out.attrs[name] = np.asarray(value)
        return out


def merge_meshes(meshes: list[Mesh]) -> Mesh:
    """메시를 합친다. 속성은 모든 메시에 있는 키만 남긴다."""
    meshes = [m for m in meshes if m.count and len(m.triangles)]
    if not meshes:
        return Mesh(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64))
    keys = set(meshes[0].attrs)
    for m in meshes[1:]:
        keys &= set(m.attrs)
    positions, triangles, offset = [], [], 0
    attrs: dict[str, list[np.ndarray]] = {k: [] for k in keys}
    for m in meshes:
        positions.append(m.positions)
        triangles.append(m.triangles + offset)
        offset += m.count
        for k in keys:
            attrs[k].append(m.attrs[k])
    return Mesh(np.concatenate(positions), np.concatenate(triangles), {k: np.concatenate(v) for k, v in attrs.items()})


def compact(mesh: Mesh, extra: np.ndarray | None = None) -> tuple[Mesh, np.ndarray]:
    """쓰이지 않는 정점을 지운다. (새 메시, 옛 번호 → 새 번호(없으면 -1))를 돌려준다. `extra`(옛 정점 마스크)는 함께 남길 정점이다."""
    used = np.zeros(mesh.count, dtype=bool)
    used[mesh.triangles.reshape(-1)] = True
    if extra is not None:
        used |= extra
    remap = np.full(mesh.count, -1, dtype=np.int64)
    remap[used] = np.arange(int(used.sum()))
    return Mesh(mesh.positions[used], remap[mesh.triangles], {k: v[used] for k, v in mesh.attrs.items()}), remap


def triangle_areas(positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    return 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)


def drop_degenerate(mesh: Mesh, min_area: float = 2.0e-10) -> Mesh:
    """면적이 `min_area`(m²) 이하인 삼각형과 같은 정점을 두 번 쓰는 삼각형을 지운다(검증기 V11은 1e-12 m² 이하를 퇴화로 본다)."""
    t = mesh.triangles
    ok = (t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])
    ok &= triangle_areas(mesh.positions, t) > min_area
    out = Mesh(mesh.positions, t[ok], mesh.attrs)
    return compact(out)[0]


def vertex_neighbors(triangles: np.ndarray, count: int) -> tuple[np.ndarray, np.ndarray]:
    """CSR 이웃(중복 제거)."""
    from character_kit.skin import vertex_adjacency

    return vertex_adjacency(np.asarray(triangles, dtype=np.int64), count)


def laplacian_values(values: np.ndarray, ptr: np.ndarray, idx: np.ndarray, iterations: int, lam: float = 0.5, fixed: np.ndarray | None = None) -> np.ndarray:
    """정점 값(n,…)을 이웃 평균 쪽으로 `lam`만큼 당기기를 반복한다(`fixed`가 True인 정점은 고정)."""
    out = np.array(values, dtype=np.float64)
    counts = np.diff(ptr)
    owner = np.repeat(np.arange(len(counts)), counts)
    safe = np.maximum(counts, 1).reshape((-1,) + (1,) * (out.ndim - 1))
    for _ in range(iterations):
        total = np.zeros_like(out)
        np.add.at(total, owner, out[idx])
        mean = total / safe
        step = out + lam * (mean - out)
        step[counts == 0] = out[counts == 0]
        if fixed is not None:
            step[fixed] = out[fixed]
        out = step
    return out


def boundary_half_edges(triangles: np.ndarray) -> np.ndarray:
    """열린 가장자리 반변(a→b, 삼각형 감김 방향) (k,2)."""
    t = np.asarray(triangles, dtype=np.int64)
    he = np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]])
    big = int(he.max()) + 1 if len(he) else 1
    key = he[:, 0] * big + he[:, 1]
    rkey = he[:, 1] * big + he[:, 0]
    return he[~np.isin(key, rkey)]


def boundary_loops(triangles: np.ndarray) -> list[np.ndarray]:
    """열린 가장자리 고리들(정점 번호 순서 배열). 비다양체 가장자리는 가능한 한 이어 붙인다."""
    he = boundary_half_edges(triangles)
    outgoing: dict[int, list[int]] = {}
    for a, b in he.tolist():
        outgoing.setdefault(a, []).append(b)
    loops: list[np.ndarray] = []
    while outgoing:
        start = next(iter(outgoing))
        loop = [start]
        current = start
        while True:
            nexts = outgoing.get(current)
            if not nexts:
                break
            nxt = nexts.pop()
            if not nexts:
                del outgoing[current]
            if nxt == start:
                break
            loop.append(nxt)
            current = nxt
        if len(loop) >= 3:
            loops.append(np.array(loop, dtype=np.int64))
    return loops


def cut_mesh(mesh: Mesh, values: np.ndarray, *, split: bool = False, snap: float = 0.0010) -> tuple[Mesh, np.ndarray]:
    """스칼라장 `values`(정점별, 거리 단위 m 가정)의 0 등위선으로 메시를 자른다.

    `split=False`면 값 ≥ 0 쪽만 남기고, `split=True`면 양쪽을 다 남기되 등위선에 정점 고리를 넣는다(띠 경계 만들기).
    |값| < `snap`인 정점은 등위선 위로 본다(아주 가는 조각 삼각형을 막는다). 돌려주는 값: (새 메시, 등위선 위 정점 마스크).
    교차 정점은 변마다 하나만 만들어 이웃 삼각형이 공유하므로 절단선은 틈이 없다.
    """
    positions, triangles = mesh.positions, mesh.triangles
    f = np.asarray(values, dtype=np.float64).copy()
    f[np.abs(f) < snap] = 0.0
    sign = np.sign(f).astype(np.int64)
    tri_sign = sign[triangles]
    has_pos = (tri_sign > 0).any(axis=1)
    has_neg = (tri_sign < 0).any(axis=1)
    mixed = has_pos & has_neg
    whole_pos = ~has_neg & ~mixed
    whole_neg = has_neg & ~has_pos
    count = mesh.count
    new_points: list[np.ndarray] = []
    new_attr: dict[str, list[Any]] = {k: [] for k in mesh.attrs}
    edge_vertex: dict[tuple[int, int], int] = {}

    def edge_point(a: int, b: int) -> int:
        key = (a, b) if a < b else (b, a)
        found = edge_vertex.get(key)
        if found is not None:
            return found
        t = f[a] / (f[a] - f[b])
        index = count + len(new_points)
        new_points.append(positions[a] + t * (positions[b] - positions[a]))
        for k, arr in mesh.attrs.items():
            if np.issubdtype(arr.dtype, np.floating):
                new_attr[k].append(arr[a] + t * (arr[b] - arr[a]))
            else:
                new_attr[k].append(arr[a] if t < 0.5 else arr[b])
        edge_vertex[key] = index
        return index

    all_points = positions  # 대각선 고를 때 쓴다(새 정점은 new_points에서 찾는다)

    def point(i: int) -> np.ndarray:
        return all_points[i] if i < count else new_points[i - count]

    def fan(poly: list[int]) -> list[list[int]]:
        if len(poly) < 3:
            return []
        if len(poly) == 4:
            d02 = np.linalg.norm(point(poly[0]) - point(poly[2]))
            d13 = np.linalg.norm(point(poly[1]) - point(poly[3]))
            if d13 < d02:
                poly = poly[1:] + poly[:1]
        return [[poly[0], poly[i], poly[i + 1]] for i in range(1, len(poly) - 1)]

    out_pos: list[list[int]] = []
    out_neg: list[list[int]] = []
    for tri in triangles[mixed].tolist():
        poly_pos: list[int] = []
        poly_neg: list[int] = []
        for i in range(3):
            a, b = tri[i], tri[(i + 1) % 3]
            sa, sb = sign[a], sign[b]
            if sa >= 0:
                poly_pos.append(a)
            if sa <= 0:
                poly_neg.append(a)
            if sa * sb < 0:
                m = edge_point(a, b)
                poly_pos.append(m)
                poly_neg.append(m)
        out_pos += fan(poly_pos)
        out_neg += fan(poly_neg)

    added = len(new_points)
    full_positions = np.concatenate([positions, np.array(new_points).reshape(-1, 3)]) if added else positions.copy()
    attrs: dict[str, np.ndarray] = {}
    for k, arr in mesh.attrs.items():
        if added:
            extra = np.array(new_attr[k], dtype=arr.dtype).reshape((added,) + arr.shape[1:])
            attrs[k] = np.concatenate([arr, extra])
        else:
            attrs[k] = arr.copy()
    pieces = [triangles[whole_pos], np.array(out_pos, dtype=np.int64).reshape(-1, 3)]
    if split:
        pieces += [triangles[whole_neg], np.array(out_neg, dtype=np.int64).reshape(-1, 3)]
    on_level = np.concatenate([f == 0.0, np.ones(added, dtype=bool)])
    result = Mesh(full_positions, np.concatenate(pieces), attrs)
    result, remap = compact(result)
    level = np.zeros(result.count, dtype=bool)
    level[remap[on_level & (remap >= 0)]] = True
    return result, level


def level_loops(mesh: Mesh, on_level: np.ndarray) -> list[np.ndarray]:
    """열린 가장자리 고리 중 정점이 모두 `on_level`인 고리(= 절단선)."""
    out = []
    for loop in boundary_loops(mesh.triangles):
        if on_level[loop].mean() > 0.9:
            out.append(loop)
    return out


def smoothstep(edge0: float, edge1: float, x: Any) -> np.ndarray:
    span = edge1 - edge0
    t = np.clip((np.asarray(x, dtype=np.float64) - edge0) / (span if abs(span) > 1e-12 else 1e-12), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def orient_like(positions: np.ndarray, triangles: np.ndarray, direction_fn: Callable[[np.ndarray], np.ndarray]) -> np.ndarray:
    """삼각형마다 면 법선이 `direction_fn(무게중심)` 쪽을 보게 감김을 고친다."""
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    normal = np.cross(b - a, c - a)
    want = direction_fn((a + b + c) / 3.0)
    flip = np.einsum("ij,ij->i", normal, want) < 0
    out = triangles.copy()
    out[flip] = out[flip][:, [0, 2, 1]]
    return out


# ---------------------------------------------------------------- 베이스 몸


@dataclass
class BodyLandmarks:
    """의상 치수의 기준 높이·축(T-포즈, m)."""

    height: float
    neck_axis_z: float
    neck_front_y: float  # 목 앞 밑동(쇄골 사이 오목)
    neck_back_y: float  # 목 뒤 밑동(7번 목뼈)
    shoulder_y: float  # 어깨 윗면(어깨 관절 위)
    armpit_y: float
    bust_y: float  # 몸통 앞이 가장 튀어나온 높이(여성 가슴 / 남성 가슴근)
    waist_y: float  # 몸통 폭이 가장 좁은 높이
    hip_y: float  # 골반 폭이 가장 넓은 높이
    crotch_y: float
    knee_y: float
    ankle_y: float
    joints: dict[str, np.ndarray]

    def joint(self, name: str) -> np.ndarray:
        return self.joints[name if name.startswith("mixamorig:") or name.startswith("TS_") else f"mixamorig:{name}"]


class BaseBody:
    """베이스 리타깃 npz(`base_model_<base>.npz`)를 의상 생성용으로 감싼다: 용접한 몸·머리, 충돌 표면, 영역, 랜드마크."""

    def __init__(self, npz_path: str | Path, base_id: str) -> None:
        from character_kit.base_assembly import load_base_model

        self.base_id = base_id
        self.model = load_base_model(npz_path)
        body = self.model.mesh("body_")
        head = self.model.mesh("head_")
        self.region_ids: list[str] = list(self.model.region_ids)
        self.raw_body = body
        self.raw_head = head
        index, canon = gf.weld_vertices(body["tpose_positions"].astype(np.float64))
        self.weld_index = index
        self.P = canon
        self.T = index[body["triangles"].astype(np.int64)]
        first = np.zeros(len(canon), dtype=np.int64)
        first[index[::-1]] = np.arange(len(index))[::-1]
        self.first = first
        self.region = body["region"].astype(np.int64)[first]
        normals = body["normals"].astype(np.float64)[first]
        self.N = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
        hindex, hcanon = gf.weld_vertices(head["tpose_positions"].astype(np.float64))
        self.HP = hcanon
        self.HT = hindex[head["triangles"].astype(np.int64)]
        hfirst = np.zeros(len(hcanon), dtype=np.int64)
        hfirst[hindex[::-1]] = np.arange(len(hindex))[::-1]
        hnormals = head["normals"].astype(np.float64)[hfirst]
        self.HN = hnormals / np.maximum(np.linalg.norm(hnormals, axis=1, keepdims=True), 1e-12)
        # 충돌·결합 표면: 몸 + 머리(목 이음매는 두 메시가 같은 위치의 정점을 가진다)
        self.UP = np.concatenate([self.P, self.HP])
        self.UT = np.concatenate([self.T, self.HT + len(self.P)])
        self.UN = np.concatenate([self.N, self.HN])
        self.surface = Surface(self.UP, self.UT)
        self.body_surface = Surface(self.P, self.T)
        self.joint_names: list[str] = list(self.model.joint_names)
        self.joint_parents: list[int] = list(self.model.joint_parents)
        self.J = self.model.arrays["joint_tpose"].astype(np.float64)
        self.landmarks = self._landmarks()
        self._skin_tree = None

    # -- 영역
    def region_index(self, name: str) -> int:
        return self.region_ids.index(name)

    def region_mask(self, names: list[str] | tuple[str, ...]) -> np.ndarray:
        return np.isin(self.region, [self.region_index(n) for n in names])

    def joint(self, name: str) -> np.ndarray:
        return self.J[self.joint_names.index(name if ":" in name or name.startswith("TS_") else f"mixamorig:{name}")]

    # -- 랜드마크
    def _landmarks(self) -> BodyLandmarks:
        P = self.P
        joints = {name: self.J[i] for i, name in enumerate(self.joint_names)}
        torso = self.region_mask(["torso", "pelvis"])
        height = float(self.HP[:, 1].max())

        def width_at(y: float) -> float:
            s = P[torso & (np.abs(P[:, 1] - y) < 0.008)]
            return float(np.abs(s[:, 0]).max()) if len(s) else float("nan")

        def front_at(y: float) -> float:
            s = P[torso & (np.abs(P[:, 1] - y) < 0.008) & (np.abs(P[:, 0]) < 0.12)]
            return float(s[:, 2].max()) if len(s) else float("nan")

        ys = np.arange(0.95, 1.20, 0.005)
        waist_y = float(ys[int(np.nanargmin([width_at(y) for y in ys]))])
        ys = np.arange(0.72, 0.95, 0.005)
        hip_y = float(ys[int(np.nanargmax([width_at(y) for y in ys]))])
        upper = self.region_mask(["upperArm.L"])
        arm_points = P[upper]
        armpit_y = float(arm_points[arm_points[:, 0] < arm_points[:, 0].min() + 0.03, 1].min())
        # 가슴(여성 가슴 / 남성 가슴근): 겨드랑이 아래 4~22 cm 사이에서 몸통 앞이 가장 튀어나온 높이(남성 배 돌출을 가슴으로 잡지 않게 범위를 둔다)
        ys = np.arange(armpit_y - 0.22, armpit_y - 0.04, 0.005)
        bust_y = float(ys[int(np.nanargmax([front_at(y) for y in ys]))])
        neck = self.region_mask(["neck"])
        neck_points = P[neck]
        front = neck_points[np.abs(neck_points[:, 0]) < 0.02]
        neck_front_y = float(front[front[:, 2] > 0, 1].min()) if (front[:, 2] > 0).any() else 1.33
        neck_back_y = float(front[front[:, 2] < 0, 1].min()) if (front[:, 2] < 0).any() else 1.38
        shoulder = joints["mixamorig:LeftArm"]
        top = P[(np.abs(P[:, 0] - shoulder[0]) < 0.01) & (np.abs(P[:, 2] - shoulder[2]) < 0.03)]
        shoulder_y = float(top[:, 1].max()) if len(top) else float(shoulder[1] + 0.05)
        pelvis = P[self.region_mask(["pelvis"])]
        crotch = pelvis[np.abs(pelvis[:, 0]) < 0.01]
        crotch_y = float(crotch[:, 1].min()) if len(crotch) else 0.76
        neck_ring = P[neck & (P[:, 1] > neck_front_y + 0.03)]
        neck_axis_z = float(0.5 * (neck_ring[:, 2].min() + neck_ring[:, 2].max())) if len(neck_ring) else 0.005
        return BodyLandmarks(
            height=height,
            neck_axis_z=neck_axis_z,
            neck_front_y=neck_front_y,
            neck_back_y=neck_back_y,
            shoulder_y=shoulder_y,
            armpit_y=armpit_y,
            bust_y=bust_y,
            waist_y=waist_y,
            hip_y=hip_y,
            crotch_y=crotch_y,
            knee_y=float(joints["mixamorig:LeftLeg"][1]),
            ankle_y=float(joints["mixamorig:LeftFoot"][1]),
            joints=joints,
        )

    # -- 단면 측정
    def torso_center_z(self, y: np.ndarray) -> np.ndarray:
        """높이마다 몸통 앞뒤 중심 z(|x| < 6 cm 띠의 앞·뒤 끝 중간). 높이 사이는 보간."""
        if not hasattr(self, "_center_table"):
            torso = self.region_mask(["torso", "pelvis", "neck"])
            P = self.P[torso]
            grid = np.arange(0.70, 1.46, 0.01)
            values = []
            for y0 in grid:
                s = P[(np.abs(P[:, 1] - y0) < 0.012) & (np.abs(P[:, 0]) < 0.06)]
                values.append(0.5 * (s[:, 2].min() + s[:, 2].max()) if len(s) > 4 else np.nan)
            values = np.array(values)
            good = ~np.isnan(values)
            values = np.interp(grid, grid[good], values[good])
            kernel = np.array([1, 2, 3, 2, 1], dtype=np.float64)
            kernel /= kernel.sum()
            padded = np.concatenate([values[:2][::-1], values, values[-2:][::-1]])
            values = np.convolve(padded, kernel, mode="valid")
            self._center_table = (grid, values)
        grid, values = self._center_table
        return np.interp(np.asarray(y, dtype=np.float64), grid, values)

    def armpit_points(self) -> dict[float, np.ndarray]:
        """좌우 겨드랑이 꼭지점(팔과 몸통이 만나는 가장 깊은 곳 근처, 몸 표면)."""
        if not hasattr(self, "_armpits"):
            out = {}
            for sign, name in ((1.0, "upperArm.L"), (-1.0, "upperArm.R")):
                arm = self.P[self.region_mask([name])]
                inner = arm[np.abs(arm[:, 0]) < np.abs(arm[:, 0]).min() + 0.03]
                apex = inner[np.argmin(inner[:, 1])]
                out[sign] = apex
            self._armpits = out
        return self._armpits

    def underwear_top(self, theta: np.ndarray) -> np.ndarray:
        """몸통 축 각도별 속옷(팬티) 윗선 높이 — 하의 허리선이 이보다 위에 있어야 속옷이 비치지 않는다."""
        if not hasattr(self, "_uw_table"):
            key = "mesh/TS_Underwear/0/tpose_positions"
            under = self.model.arrays[key].astype(np.float64) if key in self.model.arrays else np.zeros((0, 3))
            pants = under[under[:, 1] < self.landmarks.waist_y - 0.03]
            frame = AxisFrame(self, "torso")
            bins = np.linspace(-np.pi, np.pi, 49)
            table = np.full(48, self.landmarks.hip_y + 0.12)
            if len(pants):
                _, _, th, _ = frame.cyl(pants)
                idx = np.clip(np.digitize(th, bins) - 1, 0, 47)
                for k in range(48):
                    sel = idx == k
                    if sel.any():
                        table[k] = pants[sel, 1].max()
            table = np.maximum.reduce([table, np.roll(table, 1), np.roll(table, -1)])
            self._uw_table = (0.5 * (bins[:-1] + bins[1:]), table)
        centers, table = self._uw_table
        return np.interp(np.asarray(theta, dtype=np.float64), centers, table, period=2 * np.pi)

    def side_seam_z(self, y: np.ndarray) -> np.ndarray:
        """옆선 높이별 z: 몸통 폭이 가장 넓은 옆 점들의 z를 높이에 대해 1차식으로 맞춘 매끈한 선(가슴·엉덩이 굴곡에 끌려 휘지 않게)."""
        if not hasattr(self, "_side_fit"):
            torso = self.region_mask(["torso", "pelvis"])
            P = self.P[torso]
            lm = self.landmarks
            ys, zs = [], []
            for y0 in np.arange(lm.crotch_y + 0.03, lm.armpit_y - 0.03, 0.01):
                s = P[np.abs(P[:, 1] - y0) < 0.006]
                if len(s) < 6:
                    continue
                left = s[s[:, 0] > 0]
                if len(left) == 0:
                    continue
                widest = left[np.argmax(left[:, 0])]
                ys.append(y0)
                zs.append(widest[2])
            arm_z = float(self.joint("LeftArm")[2])
            ys.append(lm.armpit_y + 0.06)
            zs.append(arm_z)
            self._side_fit = np.polyfit(np.array(ys), np.array(zs), 1, w=np.r_[np.ones(len(ys) - 1), 4.0])
        return np.polyval(self._side_fit, np.asarray(y, dtype=np.float64))

    def signed_distance(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """몸+머리 표면까지의 부호 있는 거리(바깥 +)와 그 점의 보간 법선."""
        d, _, normal = gf.signed_distance(points, self.surface, self.UN)
        return d, normal


# ---------------------------------------------------------------- 셸: 몸 표면 오프셋 + 이완


def body_submesh(body: BaseBody, keep: np.ndarray) -> Mesh:
    """용접한 몸에서 정점 마스크 `keep`의 세 정점이 모두 든 삼각형만 고른 부분 메시. 속성: `src`(몸 정점 번호), `region`."""
    tri_keep = keep[body.T].all(axis=1)
    sub = Mesh(body.P, body.T[tri_keep], {"src": np.arange(len(body.P)), "region": body.region.copy()})
    sub, _ = compact(sub)
    return sub


def remove_small_components(mesh: Mesh, min_fraction: float = 0.02) -> Mesh:
    """삼각형 수가 가장 큰 덩어리의 `min_fraction` 미만인 덩어리를 지운다(영역 선택에서 떨어져 나온 조각)."""
    labels = component_labels(mesh.triangles, mesh.count)
    tri_label = labels[mesh.triangles[:, 0]]
    values, counts = np.unique(tri_label, return_counts=True)
    keep_labels = values[counts >= max(1, int(min_fraction * counts.max()))]
    out = Mesh(mesh.positions, mesh.triangles[np.isin(tri_label, keep_labels)], mesh.attrs)
    return compact(out)[0]


def component_labels(triangles: np.ndarray, count: int) -> np.ndarray:
    parent = np.arange(count)

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return int(x)

    for a, b, c in np.asarray(triangles, dtype=np.int64).tolist():
        ra = find(a)
        for v in (b, c):
            rv = find(v)
            if rv != ra:
                parent[rv] = ra
    return np.array([find(i) for i in range(count)], dtype=np.int64)


@dataclass
class RelaxSpec:
    """셸 이완 설정. `d_lo`/`d_hi`는 정점별 몸 표면 거리 하한·상한(m, 배열 또는 스칼라)."""

    iterations: int = 30
    lam: float = 0.5
    mu: float = -0.53
    drape: Callable[[np.ndarray], np.ndarray] | None = None  # 위치 → 새 위치(드레이프), 몇 회마다 적용
    drape_every: int = 3
    pinned: np.ndarray | None = None
    constraints: list[Callable[[np.ndarray], np.ndarray]] = field(default_factory=list)  # 몸 제약 뒤에 거는 추가 제약(아래 레이어 바깥 등)


def relax_shell(body: BaseBody, mesh: Mesh, d_lo: np.ndarray | float, d_hi: np.ndarray | float, spec: RelaxSpec) -> Mesh:
    """Taubin 평활과 몸 거리 제약(`d_lo` ≤ d ≤ `d_hi`)을 번갈아 걸어 셸을 천처럼 편다. 마지막은 제약만 두 번 더 건다."""
    from character_kit.skin import taubin_smooth

    ptr, idx = vertex_neighbors(mesh.triangles, mesh.count)
    lo = np.broadcast_to(np.asarray(d_lo, dtype=np.float64), (mesh.count,)).copy()
    hi = np.broadcast_to(np.asarray(d_hi, dtype=np.float64), (mesh.count,)).copy()
    p = mesh.positions.copy()
    free = np.arange(mesh.count) if spec.pinned is None else np.flatnonzero(~spec.pinned)

    def constrain(points: np.ndarray) -> np.ndarray:
        d, normal = body.signed_distance(points)
        target = np.clip(d, lo, hi)
        points = points + (target - d)[:, None] * normal
        if spec.constraints:
            for extra in spec.constraints:
                points = extra(points)
            # 아래 레이어 밀어내기가 마지막이면 다리 사이·골반 주름에서 몸 안으로 밀 수 있다 → 몸 최소 거리를 다시 건다
            d, normal = body.signed_distance(points)
            points = points + np.maximum(lo - d, 0.0)[:, None] * normal
        return points

    for it in range(spec.iterations):
        p = taubin_smooth(p, free, ptr, idx, iterations=1, lam=spec.lam, mu=spec.mu)
        if spec.drape is not None and it % spec.drape_every == 0:
            p = spec.drape(p)
        p = constrain(p)
    for _ in range(2):
        p = constrain(p)
    out = mesh.copy()
    out.positions = p
    return out


def drape_envelope(
    points: np.ndarray,
    center_z: Callable[[np.ndarray], np.ndarray],
    source: np.ndarray,
    target: np.ndarray,
    slope_down: float,
    slope_side: float,
    center_x: Callable[[np.ndarray], np.ndarray] | None = None,
    chunk: int = 600,
) -> np.ndarray:
    """천이 위에서 아래로 떨어지는 기울기 한계로 몸통(또는 다리) 둘레를 채운다.

    세로축(x = `center_x(y)`, z = `center_z(y)`) 둘레 원통 좌표에서, 대상 정점 v의 반지름은
    max(r_v, max_u [r_u − slope_down·(y_u − y_v) − slope_side·호길이(u,v)]) 로 올린다(u = 위에 있는 원천 정점).
    가슴 밑·허리 뒤·허벅지 뒤 오목한 곳이 천처럼 곧게 메워진다. 돌려주는 값은 새 위치(대상 정점만 반지름 방향으로 움직인다).
    """
    out = points.copy()
    cx = center_x(points[:, 1]) if center_x is not None else np.zeros(len(points))
    cz = center_z(points[:, 1])
    rel_x = points[:, 0] - cx
    rel_z = points[:, 2] - cz
    radius = np.hypot(rel_x, rel_z)
    theta = np.arctan2(rel_x, rel_z)
    src = np.flatnonzero(source)
    dst = np.flatnonzero(target)
    if len(src) == 0 or len(dst) == 0:
        return out
    ys, rs, ts = points[src, 1], radius[src], theta[src]
    new_radius = radius.copy()
    for start in range(0, len(dst), chunk):
        block = dst[start : start + chunk]
        dy = ys[None, :] - points[block, 1][:, None]
        dth = np.abs((ts[None, :] - theta[block][:, None] + np.pi) % (2.0 * np.pi) - np.pi)
        arc = dth * radius[block][:, None]
        candidate = rs[None, :] - slope_down * dy - slope_side * arc
        candidate[dy <= 0.0] = -np.inf
        envelope = candidate.max(axis=1)
        new_radius[block] = np.maximum(radius[block], envelope)
    grow = new_radius - radius
    moved = np.flatnonzero(grow > 1e-7)
    direction = np.stack([rel_x[moved], np.zeros(len(moved)), rel_z[moved]], axis=1) / np.maximum(radius[moved], 1e-9)[:, None]
    out[moved] += direction * grow[moved][:, None]
    return out


def decimate(mesh: Mesh, target_triangles: int, symmetry: bool = True) -> Mesh:
    """bpy Decimate(Collapse, X 대칭)로 삼각형 수를 줄인다. 속성은 버린다(필요하면 다시 계산)."""
    import bpy

    if len(mesh.triangles) <= target_triangles:
        return Mesh(mesh.positions.copy(), mesh.triangles.copy())
    data = bpy.data.meshes.new("forge_decimate")
    data.from_pydata(mesh.positions.tolist(), [], mesh.triangles.tolist())
    data.update()
    obj = bpy.data.objects.new("forge_decimate", data)
    bpy.context.scene.collection.objects.link(obj)
    try:
        modifier = obj.modifiers.new("decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = float(target_triangles) / float(len(mesh.triangles))
        modifier.use_collapse_triangulate = True
        modifier.use_symmetry = symmetry
        modifier.symmetry_axis = "X"
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(depsgraph)
        result = evaluated.to_mesh()
        count = len(result.vertices)
        positions = np.empty(count * 3, dtype=np.float64)
        result.vertices.foreach_get("co", positions)
        triangles = []
        for poly in result.polygons:
            verts = list(poly.vertices)
            for i in range(1, len(verts) - 1):
                triangles.append([verts[0], verts[i], verts[i + 1]])
        evaluated.to_mesh_clear()
    finally:
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(data)
    return drop_degenerate(Mesh(positions.reshape(-1, 3), np.array(triangles, dtype=np.int64)))


# ---------------------------------------------------------------- 축 좌표계·장(field)


class AxisFrame:
    """원통 좌표계: 몸통(세로축, 높이마다 앞뒤 중심), 팔(어깨→손목), 다리(엉덩이→발목).

    `cyl(points)` → (축 방향 좌표 t, 반지름 r, 각도 θ, 바깥 방향 단위벡터). 몸통은 t = y, θ = 0이 앞(+z), +π/2가 캐릭터 왼쪽(+x).
    팔·다리는 θ = 0이 위(+y, 팔) 또는 앞(+z, 다리)이다.
    """

    def __init__(self, body: "BaseBody", kind: str, side: float = 1.0) -> None:
        self.body = body
        self.kind = kind
        self.side = side
        if kind == "arm":
            name = "Left" if side > 0 else "Right"
            self.origin = body.joint(f"{name}Arm")
            wrist = body.joint(f"{name}Hand")
            self.axis = (wrist - self.origin) / np.linalg.norm(wrist - self.origin)
            up = np.array([0.0, 1.0, 0.0])
            self.e1 = up - (up @ self.axis) * self.axis
            self.e1 /= np.linalg.norm(self.e1)
            self.e2 = np.cross(self.axis, self.e1)
        elif kind == "leg":
            name = "Left" if side > 0 else "Right"
            self.origin = body.joint(f"{name}UpLeg")
            ankle = body.joint(f"{name}Foot")
            self.axis = (ankle - self.origin) / np.linalg.norm(ankle - self.origin)
            front = np.array([0.0, 0.0, 1.0])
            self.e1 = front - (front @ self.axis) * self.axis
            self.e1 /= np.linalg.norm(self.e1)
            self.e2 = np.cross(self.axis, self.e1)
        elif kind != "torso":
            raise ValueError(kind)

    def cyl(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        points = np.asarray(points, dtype=np.float64)
        if self.kind == "torso":
            cz = self.body.torso_center_z(points[:, 1])
            rel = np.stack([points[:, 0], np.zeros(len(points)), points[:, 2] - cz], axis=1)
            r = np.linalg.norm(rel, axis=1)
            theta = np.arctan2(rel[:, 0], rel[:, 2])
            return points[:, 1], r, theta, rel / np.maximum(r, 1e-9)[:, None]
        q = points - self.origin
        t = q @ self.axis
        rel = q - np.outer(t, self.axis)
        r = np.linalg.norm(rel, axis=1)
        theta = np.arctan2(rel @ self.e2, rel @ self.e1)
        return t, r, theta, rel / np.maximum(r, 1e-9)[:, None]


class PolarEnvelope:
    """축 좌표(t × θ) 칸마다 점들의 최대 반지름 — 아래 레이어 의상의 바깥 경계. 칸 이웃으로 넓혀 보수적으로 잡는다."""

    def __init__(self, frame: AxisFrame, points: np.ndarray, t_range: tuple[float, float], dt: float = 0.008, n_theta: int = 120, grow: int = 1) -> None:
        self.frame = frame
        self.t0, self.t1 = t_range
        self.dt = dt
        self.n_theta = n_theta
        n_t = max(1, int(math.ceil((self.t1 - self.t0) / dt)))
        table = np.full((n_t, n_theta), -np.inf)
        if len(points):
            t, r, theta, _ = frame.cyl(points)
            ti = np.floor((t - self.t0) / dt).astype(np.int64)
            hi = np.floor((theta + np.pi) / (2 * np.pi) * n_theta).astype(np.int64) % n_theta
            ok = (ti >= 0) & (ti < n_t)
            np.maximum.at(table, (ti[ok], hi[ok]), r[ok])
        for _ in range(grow):
            grown = table.copy()
            for shift in (-1, 1):
                grown = np.maximum(grown, np.roll(table, shift, axis=1))
                rolled = np.roll(table, shift, axis=0)
                if shift > 0:
                    rolled[0] = -np.inf
                else:
                    rolled[-1] = -np.inf
                grown = np.maximum(grown, rolled)
            table = grown
        self.table = table

    def lookup(self, t: np.ndarray, theta: np.ndarray) -> np.ndarray:
        n_t = len(self.table)
        ti = np.floor((t - self.t0) / self.dt).astype(np.int64)
        hi = np.floor((theta + np.pi) / (2 * np.pi) * self.n_theta).astype(np.int64) % self.n_theta
        out = np.full(len(t), -np.inf)
        ok = (ti >= 0) & (ti < n_t)
        out[ok] = self.table[ti[ok], hi[ok]]
        return out

    def push_out(self, points: np.ndarray, gap: float, mask: np.ndarray | None = None) -> np.ndarray:
        """`mask` 정점의 반지름을 경계 + `gap` 이상으로 바깥(축에서 멀어지는 쪽)으로 민다."""
        t, r, theta, direction = self.frame.cyl(points)
        need = self.lookup(t, theta) + gap - r
        move = need > 0.0
        if mask is not None:
            move &= mask
        out = points.copy()
        out[move] += direction[move] * need[move][:, None]
        return out


def neck_polar(body: "BaseBody", points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """목 축(x = 0, z = 목 앞뒤 중심) 둘레 각도 φ(0 = 앞, +π/2 = 캐릭터 왼쪽)와 수평 거리 ρ."""
    rel_x = points[:, 0]
    rel_z = points[:, 2] - body.landmarks.neck_axis_z
    return np.arctan2(rel_x, rel_z), np.hypot(rel_x, rel_z)


def front_back_blend(phi: np.ndarray, front: float, side: float, back: float, power: float = 2.0) -> np.ndarray:
    """각도별 값: 앞(φ=0) `front`, 옆(±π/2) `side`, 뒤(π) `back`을 cos 가중으로 잇는다."""
    c = np.cos(phi)
    wf = np.clip(c, 0.0, 1.0) ** power
    wb = np.clip(-c, 0.0, 1.0) ** power
    return side + (front - side) * wf + (back - side) * wb


def arm_axial(body: "BaseBody", points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """정점마다 같은 쪽 팔의 어깨 관절에서 팔 방향으로 잰 거리(m)와 팔 쪽 부호(+1 왼쪽, −1 오른쪽)."""
    side = np.where(points[:, 0] >= 0.0, 1.0, -1.0)
    axial = np.zeros(len(points))
    for sign in (1.0, -1.0):
        frame = AxisFrame(body, "arm", sign)
        sel = side == sign
        axial[sel] = (points[sel] - frame.origin) @ frame.axis
    return axial, side


def sleeve_field(body: "BaseBody", points: np.ndarray, length: float) -> np.ndarray:
    """소매 끝(어깨 관절에서 팔 방향 `length` m) 너머가 음수인 장."""
    axial, _ = arm_axial(body, points)
    field = length - axial
    field[np.abs(points[:, 0]) < 0.12] = 1.0
    return field


def region_of_points(body: "BaseBody", points: np.ndarray) -> np.ndarray:
    """점마다 가장 가까운 몸 표면 삼각형의 영역 번호(첫 꼭짓점)."""
    hits = body.body_surface.closest(points)
    return body.region[body.T[np.maximum(hits.triangle, 0), 0]]


# ---------------------------------------------------------------- 셸 계획·빌드


@dataclass
class ShellPlan:
    """몸 오프셋 셸 만들기 계획(상의·바지 공통)."""

    regions: tuple[str, ...]
    ease: Callable[["BaseBody", np.ndarray, np.ndarray], np.ndarray]  # (몸, 몸 정점 위치, 영역 번호) → 여유(m)
    d_lo: Callable[["BaseBody", np.ndarray, np.ndarray, np.ndarray], np.ndarray]  # (몸, 위치, 영역, 여유) → 최소 거리
    d_hi: Callable[["BaseBody", np.ndarray, np.ndarray, np.ndarray], np.ndarray]
    select: Callable[["BaseBody", np.ndarray, np.ndarray], np.ndarray]  # (몸, 위치, 영역) → 남길 정점 마스크(절단 여유 포함)
    iterations: int = 30
    drape: dict[str, Any] | None = None  # {"kind": "torso"|"legs", "down": …, "side": …, "top": y, "regions": (...)}
    target_triangles: int = 9000
    shape: Callable[["BaseBody", np.ndarray, np.ndarray], np.ndarray] | None = None  # 이완 뒤 형태 보정(어깨 패드 등): (몸, 위치, 영역) → 새 위치
    pin: Callable[["BaseBody", np.ndarray], np.ndarray] | None = None  # (몸, 몸 정점 위치) → 평활에서 고정할 정점(겨드랑이처럼 건너뛰면 물갈퀴가 되는 오목한 곳)


def build_body_shell(body: "BaseBody", plan: ShellPlan, constraints: list[Callable[[np.ndarray], np.ndarray]] | None = None) -> Mesh:
    """계획대로 몸 오프셋 셸을 만든다: 영역 선택 → 여유만큼 부풀림 → 이완(평활·거리 제약·드레이프·아래 레이어) → 축소."""
    keep = np.isin(body.region, [body.region_index(r) for r in plan.regions])
    keep &= plan.select(body, body.P, body.region)
    sub = remove_small_components(body_submesh(body, keep))
    src = sub.attrs["src"]
    region = sub.attrs["region"]
    ease = plan.ease(body, body.P[src], region)
    ptr, idx = vertex_neighbors(sub.triangles, sub.count)
    ease = laplacian_values(ease, ptr, idx, 10, 0.5)
    start = body.P[src] + body.N[src] * ease[:, None]
    mesh = Mesh(start, sub.triangles, {"region": region, "ease": ease})
    lo = plan.d_lo(body, start, region, ease)
    hi = plan.d_hi(body, start, region, ease)
    drape_fn = None
    if plan.drape is not None:
        d = plan.drape
        source = np.isin(region, [body.region_index(r) for r in d["regions"]])
        if d["kind"] == "torso":

            def drape_fn(p: np.ndarray, source=source, d=d) -> np.ndarray:
                # 원천: 앞·뒤(가슴·견갑골)는 `top`까지, 옆구리는 겨드랑이 아래 `side_top`부터만(겨드랑이 근처 팔 뿌리 정점이 옆판을 밀어내지 않게)
                rel_x = p[:, 0]
                rel_z = p[:, 2] - body.torso_center_z(p[:, 1])
                facing = np.abs(rel_z) / np.maximum(np.hypot(rel_x, rel_z), 1e-9)
                side_top = d.get("side_top", d["top"] - 0.05)
                src = source & (((facing > 0.45) & (p[:, 1] < d["top"])) | (p[:, 1] < side_top))
                return drape_envelope(p, body.torso_center_z, src, source & (p[:, 1] < d["top"]), d["down"], d["side"])

        else:

            def drape_fn(p: np.ndarray, source=source, d=d) -> np.ndarray:
                out = p.copy()
                for sign in (1.0, -1.0):
                    frame = AxisFrame(body, "leg", sign)
                    side = (np.sign(p[:, 0]) == sign) & source
                    if not side.any():
                        continue
                    hip, ankle = frame.origin, frame.origin + frame.axis * 0.9

                    def cx(y: np.ndarray, hip=hip, ankle=ankle) -> np.ndarray:
                        return np.interp(y, [ankle[1], hip[1]], [ankle[0], hip[0]])

                    def cz(y: np.ndarray, hip=hip, ankle=ankle) -> np.ndarray:
                        return np.interp(y, [ankle[1], hip[1]], [ankle[2], hip[2]])

                    out = drape_envelope(out, cz, side, side & (p[:, 1] < d["top"]), d["down"], d["side"], center_x=cx)
                return out

    pinned = plan.pin(body, body.P[src]) if plan.pin is not None else None
    relaxed = relax_shell(body, mesh, lo, hi, RelaxSpec(iterations=plan.iterations, drape=drape_fn, constraints=list(constraints or []), pinned=pinned))
    if plan.shape is not None:
        relaxed.positions = plan.shape(body, relaxed.positions, relaxed.attrs["region"])
    reduced = decimate(relaxed, plan.target_triangles)
    # 축소 뒤에도 몸·아래 레이어 제약을 한 번 더(축소가 정점을 옮긴다)
    d, normal = body.signed_distance(reduced.positions)
    floor = float(np.percentile(lo, 5)) if np.ndim(lo) else float(lo)
    reduced.positions = reduced.positions + np.maximum(floor - d, 0.0)[:, None] * normal
    for extra in constraints or []:
        reduced.positions = extra(reduced.positions)
    if constraints:
        d, normal = body.signed_distance(reduced.positions)
        reduced.positions = reduced.positions + np.maximum(floor - d, 0.0)[:, None] * normal
    reduced.attrs["region"] = region_of_points(body, reduced.positions)
    return reduced


def cut_edge(mesh: Mesh, name: str, values: np.ndarray, bands: tuple[float, ...] = (), snap: float = 0.0012) -> tuple[Mesh, list[np.ndarray]]:
    """장 `values` ≥ 0 쪽만 남겨 가장자리를 만들고, 가장자리에서 `bands`(m) 거리마다 고리를 넣는다.

    장 값은 정점 속성 `f_<name>`으로 남는다(뒤이은 절단에서도 보간되어 따라간다). 고리 위 정점은 정확히 그 값(0 또는 띠 폭)을 받는다.
    돌려주는 값: (메시, 가장자리 고리들).
    """
    key = f"f_{name}"
    m = mesh.with_attr(key, np.asarray(values, dtype=np.float64))
    for width in sorted(bands, reverse=True):
        m, level = cut_mesh(m, m.attrs[key] - width, split=True, snap=min(snap, 0.3 * width))
        m.attrs[key][level] = width
    m, level = cut_mesh(m, m.attrs[key], split=False, snap=snap)
    m.attrs[key][level] = 0.0
    return m, level_loops(m, level)


def split_panels(mesh: Mesh, fields: list[np.ndarray], snap: float = 0.0015) -> Mesh:
    """판 경계 장들의 0 등위선에 정점 고리를 넣는다(솔기가 삼각형 변을 따라 매끈한 곡선이 되게). 장 값은 `s<i>` 속성으로 남는다."""
    m = mesh.copy()
    for i, values in enumerate(fields):
        m = m.with_attr(f"s{i}", np.asarray(values, dtype=np.float64)) if f"s{i}" not in m.attrs else m
    for i in range(len(fields)):
        m, level = cut_mesh(m, m.attrs[f"s{i}"], split=True, snap=snap)
        m.attrs[f"s{i}"][level] = 0.0
    return m


# ---------------------------------------------------------------- 띠·단 조각


def welded_normals(mesh: Mesh) -> np.ndarray:
    """같은 위치 정점을 합쳐 구한 매끈한 정점 법선(조각 경계에서도 이어진다)."""
    index, welded = gf.weld_vertices(mesh.positions, 1e-7)
    return vertex_normals(welded, index[mesh.triangles])[index]


def outward(normals: np.ndarray, points: np.ndarray, body: "BaseBody") -> np.ndarray:
    """법선이 몸에서 멀어지는 쪽을 보게 정점마다 뒤집는다."""
    hits = body.surface.closest(points)
    flip = np.einsum("ij,ij->i", points - hits.point, normals) < 0.0
    out = normals.copy()
    out[flip] *= -1.0
    return out


def partition(mesh: Mesh, triangle_mask: np.ndarray) -> tuple[Mesh, Mesh, np.ndarray, np.ndarray]:
    """삼각형 마스크로 메시를 둘로 나눈다(경계 정점은 양쪽에 복제). (선택, 나머지, 옛→선택 번호, 옛→나머지 번호)."""
    a, remap_a = compact(Mesh(mesh.positions, mesh.triangles[triangle_mask], mesh.attrs))
    b, remap_b = compact(Mesh(mesh.positions, mesh.triangles[~triangle_mask], mesh.attrs))
    return a, b, remap_a, remap_b


def loop_arclength(points: np.ndarray, closed: bool = True) -> np.ndarray:
    seg = np.linalg.norm(np.diff(np.concatenate([points, points[:1]]) if closed else points, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(seg)])


def ring_strip(rings: list[np.ndarray], closed: bool = True, uv_v: list[float] | None = None) -> Mesh:
    """같은 개수의 고리(정점 열)들을 차례로 이어 띠 메시를 만든다. 닫힌 고리는 이음매 정점을 복제해 UV(`uvw`: u = 첫 고리 호길이, v = `uv_v`)가 끊기게 한다."""
    count = len(rings[0])
    columns = count + 1 if closed else count
    positions = []
    uvw = []
    u = loop_arclength(rings[0], closed)
    v_values = uv_v if uv_v is not None else list(np.cumsum([0.0] + [float(np.linalg.norm(rings[k + 1] - rings[k], axis=1).mean()) for k in range(len(rings) - 1)]))
    for k, ring in enumerate(rings):
        pts = np.concatenate([ring, ring[:1]]) if closed else ring
        positions.append(pts)
        uvw.append(np.stack([u[:columns], np.full(columns, v_values[k])], axis=1))
    positions = np.concatenate(positions)
    uvw = np.concatenate(uvw)
    triangles = []
    for k in range(len(rings) - 1):
        for i in range(columns - 1):
            a, b = k * columns + i, k * columns + i + 1
            c, d = (k + 1) * columns + i, (k + 1) * columns + i + 1
            triangles += [[a, c, d], [a, d, b]]
    return Mesh(positions, np.array(triangles, dtype=np.int64), {"uvw": uvw})


def fold_edge(points: np.ndarray, normals: np.ndarray, into: np.ndarray, thickness: float, depth: float) -> Mesh:
    """열린 가장자리 고리(점 열 `points`, 바깥 법선 `normals`, 의상 안쪽을 향하는 표면 방향 `into`)에 안쪽으로 접힌 두께 단을 만든다.

    B(가장자리) → I(법선 반대로 `thickness`) → U(I에서 `into`로 `depth`)를 잇는다. 밑단·소매 끝·목둘레가 종이처럼 얇지 않은 닫힌 단으로 보인다.
    """
    n = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    g = into - np.einsum("ij,ij->i", into, n)[:, None] * n
    g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-12)
    inner = points - n * thickness
    upper = inner + g * depth
    strip = ring_strip([points, inner, upper], closed=True, uv_v=[0.0, thickness, thickness + depth])
    # 두께 면은 가장자리 바깥(−into), 시접은 몸 쪽(−n)을 보게 감김을 맞춘다
    count = len(points)
    cols = count + 1
    want = np.concatenate([np.concatenate([-g, -g[:1]]), np.concatenate([-n, -n[:1]]), np.concatenate([-n, -n[:1]])])
    strip.triangles = orient_like(strip.positions, strip.triangles, lambda c: want[np.argmin(((c[:, None, :] - strip.positions[None, :, :]) ** 2).sum(axis=2), axis=1)])
    del cols
    return strip


def attach_rings(mesh: Mesh, loop: np.ndarray, rings: list[np.ndarray], want: Callable[[np.ndarray], np.ndarray] | None = None, inherit: tuple[str, ...] = ("panel",), closed: bool = True) -> Mesh:
    """메시의 열린 고리 `loop`(정점 번호 순서)에 새 고리들(`rings`, 각 (len(loop),3))을 차례로 이어 붙인 메시.

    새 정점은 고리 정점의 속성(`inherit`)을 물려받는다. `want(무게중심)`이 주어지면 새 삼각형의 면 법선이 그 방향을 보게 감김을 맞춘다.
    """
    count = len(loop)
    base = mesh.count
    positions = [mesh.positions] + [np.asarray(r, dtype=np.float64) for r in rings]
    indices = [np.asarray(loop, dtype=np.int64)] + [base + k * count + np.arange(count) for k in range(len(rings))]
    all_positions = np.concatenate(positions)
    bands_tris = []
    for k in range(len(rings)):
        a_ring, b_ring = indices[k], indices[k + 1]
        band = []
        for i in range(count if closed else count - 1):
            j = (i + 1) % count
            band += [[a_ring[i], b_ring[i], b_ring[j]], [a_ring[i], b_ring[j], a_ring[j]]]
        band = np.array(band, dtype=np.int64)
        if want is not None and len(band):
            # 띠 하나는 감김을 통째로 맞춘다(삼각형마다 따로 뒤집으면 이웃끼리 감김이 엇갈려 법선이 깨진다)
            a, b, c = (all_positions[band[:, m]] for m in range(3))
            normal = np.cross(b - a, c - a)
            vote = np.einsum("ij,ij->i", normal, want((a + b + c) / 3.0))
            if float(np.sum(np.sign(vote) * np.linalg.norm(normal, axis=1))) < 0:
                band = band[:, [0, 2, 1]]
        bands_tris.append(band)
    new_tris = np.concatenate(bands_tris) if bands_tris else np.zeros((0, 3), dtype=np.int64)
    attrs = {}
    for key, arr in mesh.attrs.items():
        if key in inherit:
            extra = np.concatenate([arr[loop]] * len(rings))
        elif np.issubdtype(arr.dtype, np.floating):
            extra = np.full((count * len(rings),) + arr.shape[1:], np.nan)  # 덧붙인 고리는 원래 장 값이 없다(가장자리 판정에서 빠지게)
        else:
            extra = np.zeros((count * len(rings),) + arr.shape[1:], dtype=arr.dtype)
        attrs[key] = np.concatenate([arr, extra])
    return Mesh(all_positions, np.concatenate([mesh.triangles, new_tris]), attrs)


def nearest_direction(points: np.ndarray, directions: np.ndarray) -> Callable[[np.ndarray], np.ndarray]:
    """무게중심마다 가장 가까운 기준점의 방향을 돌려주는 함수(감김 맞춤용)."""
    from mathutils import kdtree

    tree = kdtree.KDTree(len(points))
    for i, p in enumerate(points.tolist()):
        tree.insert(p, i)
    tree.balance()

    def lookup(centroids: np.ndarray) -> np.ndarray:
        idx = np.array([tree.find(c)[1] for c in centroids.tolist()], dtype=np.int64)
        return directions[idx]

    return lookup


def add_fold(mesh: Mesh, loop: np.ndarray, normals: np.ndarray, into: np.ndarray, thickness: float, depth: float, closed: bool = True) -> Mesh:
    """열린 가장자리 고리에 안쪽으로 접힌 두께 단(B → I → U)을 같은 메시에 붙인다. `into`는 고리 정점마다 의상 안쪽을 향하는 표면 방향."""
    n = normals[loop] / np.maximum(np.linalg.norm(normals[loop], axis=1, keepdims=True), 1e-12)
    g = into - np.einsum("ij,ij->i", into, n)[:, None] * n
    g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-12)
    edge = mesh.positions[loop]
    inner = edge - n * thickness
    upper = inner + g * depth
    ref = np.concatenate([edge - n * 0.5 * thickness, inner + g * 0.5 * depth])
    directions = np.concatenate([-g, -n])
    return attach_rings(mesh, loop, [inner, upper], want=nearest_direction(ref, directions), closed=closed)


def band_split(mesh: Mesh, values: np.ndarray, width: float, lift: float, normals: np.ndarray) -> tuple[Mesh, Mesh]:
    """가장자리 띠(장 값 ≤ `width`)를 따로 떼어 `lift`만큼 띄우고, 본판과의 단차 면(라이저)을 띠에 이어 붙인다.

    (본판, 띠)를 돌려준다. 띠는 립·밑단 띠·커프스·허리띠처럼 따로 색 역할을 받을 수 있는 조각이고, 라이저가 본판 가장자리와 같은 위치에서
    시작하므로 두 조각 사이에 틈이 없다. 띠 메시 속성 `_v`는 원래 장 값이다.
    """
    tagged = mesh.with_attr("_v", values.astype(np.float64)).with_attr("_n", normals)
    tri_band = values[mesh.triangles].max(axis=1) <= width + 1e-7
    band, main, _, _ = partition(tagged, tri_band)
    raised = band.positions + band.attrs["_n"] * lift
    border = [loop for loop in boundary_loops(band.triangles) if np.all(band.attrs["_v"][loop] >= width - 3e-4)]
    lowered = band.copy()
    lowered.positions = raised
    for loop in border:
        n = band.attrs["_n"][loop]
        side = np.zeros((len(loop), 3))
        centroid = band.positions[loop].mean(axis=0)
        for k in range(len(loop)):
            side[k] = band.positions[loop[k]] - centroid
        ref = band.positions[loop] + n * 0.5 * lift
        lowered = attach_rings(lowered, loop, [band.positions[loop]], want=nearest_direction(ref, -band_grad(lowered, loop)), inherit=("panel", "_v", "_n"))
    main.attrs.pop("_n", None)
    main.attrs.pop("_v", None)
    return main, lowered


def band_grad(mesh: Mesh, loop: np.ndarray) -> np.ndarray:
    """고리 정점마다 띠 안쪽(가장자리 반대)을 향하는 표면 방향(이웃 평균 − 정점)."""
    ptr, idx = vertex_neighbors(mesh.triangles, mesh.count)
    loop_set = set(loop.tolist())
    out = np.zeros((len(loop), 3))
    for k, v in enumerate(loop.tolist()):
        nb = [u for u in idx[ptr[v] : ptr[v + 1]].tolist() if u not in loop_set]
        if nb:
            out[k] = mesh.positions[nb].mean(axis=0) - mesh.positions[v]
    return out


# ---------------------------------------------------------------- 디테일 기본 도형


@dataclass
class ProjectionFrame:
    """평면 다각형을 표면에 얹을 때의 투영 틀: 원점 `origin`, 평면 축 `ex`·`ey`, 표면을 향한 시선 `w`(광선 방향)."""

    origin: np.ndarray
    ex: np.ndarray
    ey: np.ndarray
    w: np.ndarray

    def to_world(self, ab: np.ndarray, depth: float = -0.6) -> np.ndarray:
        return self.origin + np.outer(ab[:, 0], self.ex) + np.outer(ab[:, 1], self.ey) + depth * self.w


FRONT = ProjectionFrame(np.zeros(3), np.array([1.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]), np.array([0.0, 0.0, -1.0]))
BACK = ProjectionFrame(np.zeros(3), np.array([-1.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]), np.array([0.0, 0.0, 1.0]))


def polygon_distance(points: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    best = np.full(len(points), np.inf)
    count = len(polygon)
    for i in range(count):
        a = polygon[i]
        b = polygon[(i + 1) % count]
        ab = b - a
        t = np.clip(((points - a) @ ab) / max(float(ab @ ab), 1e-12), 0.0, 1.0)
        best = np.minimum(best, np.linalg.norm(points - (a + t[:, None] * ab), axis=1))
    return best


def point_in_polygon(points: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    count = len(polygon)
    for i in range(count):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % count]
        crosses = (y1 > y) != (y2 > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            x_at = (x2 - x1) * (y - y1) / (y2 - y1) + x1
        inside ^= crosses & (x < x_at)
    return inside


def surface_frame_normals(carrier: Mesh) -> tuple[Surface, np.ndarray]:
    """운반 메시의 BVH와 매끈한 정점 법선."""
    return Surface(carrier.positions, carrier.triangles), welded_normals(carrier)


def surface_patch(
    carrier_surface: Surface,
    carrier_normals: np.ndarray,
    frame: ProjectionFrame,
    polygon: np.ndarray,
    base: float,
    height: float,
    bevel: float = 0.003,
    edge_height: float | None = None,
    grid: float = 0.006,
    dome: float = 0.0,
    rim_depth: float = 0.0015,
    edge_step: float = 0.0025,
) -> Mesh:
    """틀에서 본 다각형 안쪽을 제약 델로네로 삼각분할해 운반 표면에 얹은 입체 패치(윗면 + 옆 테두리).

    윗면 높이 = 표면 + 법선 × (`base` + 가장자리 `edge_height` → 안쪽 `height`, `bevel` 폭에서 부드럽게). 테두리는 윗면 가장자리에서 표면 아래 `rim_depth`까지
    내려가 틈을 막는다(주머니·라펠·플래킷·칼라 날개의 두께). 속성 `uvw`는 틀 평면 좌표(m), `edge`는 가장자리에서 잰 거리(m)다.
    """
    from mathutils import geometry

    polygon = np.asarray(polygon, dtype=np.float64)
    if edge_height is None:
        edge_height = min(height, 0.0012)
    boundary: list[np.ndarray] = []
    for i in range(len(polygon)):
        a, b = polygon[i], polygon[(i + 1) % len(polygon)]
        steps = max(1, int(math.ceil(np.linalg.norm(b - a) / edge_step)))
        boundary += [a + (b - a) * k / steps for k in range(steps)]
    boundary_points = np.array(boundary)
    xs = np.arange(polygon[:, 0].min(), polygon[:, 0].max() + grid, grid)
    ys = np.arange(polygon[:, 1].min(), polygon[:, 1].max() + grid, grid)
    mesh_grid = np.array([(x, y) for y in ys for x in xs]) if len(xs) and len(ys) else np.zeros((0, 2))
    if len(mesh_grid):
        inside = point_in_polygon(mesh_grid, polygon) & (polygon_distance(mesh_grid, polygon) > 0.45 * grid)
        mesh_grid = mesh_grid[inside]
    # 가장자리 근처 한 줄 더(베벨이 부드럽게 서도록)
    inner_ring = []
    if bevel > 0:
        centroid = polygon.mean(axis=0)
        for p in boundary_points:
            d = centroid - p
            inner_ring.append(p + d / max(np.linalg.norm(d), 1e-9) * min(bevel, 0.4 * np.linalg.norm(d)))
    inner_ring = np.array(inner_ring).reshape(-1, 2)
    if len(inner_ring):
        keep = point_in_polygon(inner_ring, polygon) & (polygon_distance(inner_ring, polygon) > 0.3 * bevel)
        inner_ring = inner_ring[keep]
    points_2d = np.concatenate([boundary_points, inner_ring, mesh_grid])
    count = len(boundary_points)
    edges = [(i, (i + 1) % count) for i in range(count)]
    out_vertices, _, out_faces, *_ = geometry.delaunay_2d_cdt([tuple(v) for v in points_2d.tolist()], edges, [], 1, 1e-9)
    ab = np.array([(v[0], v[1]) for v in out_vertices], dtype=np.float64)
    triangles = np.array(out_faces, dtype=np.int64).reshape(-1, 3)
    origins = frame.to_world(ab)
    directions = np.tile(frame.w, (len(ab), 1))
    hits, tri = carrier_surface.ray(origins, directions, 1.4)
    found = tri >= 0
    corners = carrier_surface.triangles[np.maximum(tri, 0)]
    bary = barycentric(hits, carrier_surface.positions[corners[:, 0]], carrier_surface.positions[corners[:, 1]], carrier_surface.positions[corners[:, 2]])
    bary = np.clip(bary, 0.0, 1.0)
    bary /= np.maximum(bary.sum(axis=1, keepdims=True), 1e-12)
    normals = np.einsum("mc,mck->mk", bary, carrier_normals[corners])
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    normals = np.where(np.einsum("ij,j->i", normals, -frame.w)[:, None] < 0, -normals, normals)
    distance = polygon_distance(ab, polygon)
    if dome > 0.0:
        profile = edge_height + (height - edge_height) * np.sqrt(smoothstep(0.0, dome, distance))
    else:
        profile = edge_height + (height - edge_height) * smoothstep(0.0, bevel, distance)
    top = hits + normals * (base + profile)[:, None]
    keep_tri = found[triangles].all(axis=1)
    triangles = triangles[keep_tri]
    # 윗면이 시선 반대(바깥)를 보게
    triangles = orient_like(top, triangles, lambda c: np.tile(-frame.w, (len(c), 1)))
    patch = Mesh(top, triangles, {"uvw": ab.copy(), "edge": distance})
    patch, remap = compact(patch)
    hits_c = hits[remap >= 0][np.argsort(remap[remap >= 0])]
    normals_c = normals[remap >= 0][np.argsort(remap[remap >= 0])]
    loops = boundary_loops(patch.triangles)
    if not loops:
        return patch
    loop = max(loops, key=len)
    bottom = hits_c[loop] - normals_c[loop] * rim_depth
    outward_dir = patch.positions[loop] - patch.positions[loop].mean(axis=0)
    outward_dir -= np.einsum("ij,ij->i", outward_dir, normals_c[loop])[:, None] * normals_c[loop]
    ref = 0.5 * (patch.positions[loop] + bottom)
    patch = attach_rings(patch, loop, [bottom], want=nearest_direction(ref, outward_dir), inherit=("uvw",))
    # 테두리 아래 고리의 uvw를 조금 밀어 테두리 면이 텍스처에서 0 넓이가 되지 않게 한다
    n_bottom = len(loop)
    patch.attrs["uvw"][-n_bottom:] = patch.attrs["uvw"][loop] + 0.0015
    patch.attrs["edge"][-n_bottom:] = -0.001
    return patch


def tube(path: np.ndarray, radius: float | np.ndarray, segments: int = 8, closed: bool = False, caps: bool = True) -> Mesh:
    """경로를 따르는 관(평행 이동 프레임). 속성 `uvw`: u = 둘레(m), v = 경로 호길이(m). 열린 경로는 끝을 막는다."""
    path = np.asarray(path, dtype=np.float64)
    count = len(path)
    tangent = np.gradient(path, axis=0)
    if closed:
        tangent = np.roll(path, -1, axis=0) - np.roll(path, 1, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-12)
    helper = np.array([0.0, 1.0, 0.0]) if abs(tangent[0] @ np.array([0.0, 1.0, 0.0])) < 0.9 else np.array([1.0, 0.0, 0.0])
    normal = np.cross(tangent[0], helper)
    normal /= np.linalg.norm(normal)
    radii = np.full(count, radius, dtype=np.float64) if np.ndim(radius) == 0 else np.asarray(radius, dtype=np.float64)
    arclen = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    rings, uvs = [], []
    angles = np.linspace(0.0, 2.0 * np.pi, segments + 1)
    for i in range(count):
        if i > 0:
            normal = normal - (normal @ tangent[i]) * tangent[i]
            normal /= max(np.linalg.norm(normal), 1e-12)
        binormal = np.cross(tangent[i], normal)
        rings.append(path[i] + radii[i] * (np.outer(np.cos(angles), normal) + np.outer(np.sin(angles), binormal)))
        uvs.append(np.stack([angles * radii[i], np.full(segments + 1, arclen[i])], axis=1))
    positions = np.concatenate(rings)
    uvw = np.concatenate(uvs)
    cols = segments + 1
    triangles = []
    span = count if closed else count - 1
    for i in range(span):
        j = (i + 1) % count
        for k in range(segments):
            a, b = i * cols + k, i * cols + k + 1
            c, d = j * cols + k, j * cols + k + 1
            triangles += [[a, b, d], [a, d, c]]
    mesh = Mesh(positions, np.array(triangles, dtype=np.int64), {"uvw": uvw})
    if not closed and caps:
        extra_p, extra_uv, extra_t = [], [], []
        base = len(positions)
        for ring_index, flip in ((0, True), (count - 1, False)):
            center = base + len(extra_p)
            extra_p.append(path[ring_index])
            extra_uv.append([0.0, arclen[ring_index]])
            for k in range(segments):
                a, b = ring_index * cols + k, ring_index * cols + k + 1
                extra_t.append([center, b, a] if flip else [center, a, b])
        mesh = Mesh(np.concatenate([positions, np.array(extra_p)]), np.concatenate([mesh.triangles, np.array(extra_t)]), {"uvw": np.concatenate([uvw, np.array(extra_uv)])})
    # 바깥을 보게
    mesh.triangles = orient_like(mesh.positions, mesh.triangles, nearest_axis_outward(path))
    return mesh


def nearest_axis_outward(path: np.ndarray) -> Callable[[np.ndarray], np.ndarray]:
    def lookup(centroids: np.ndarray) -> np.ndarray:
        d = ((centroids[:, None, :] - path[None, :, :]) ** 2).sum(axis=2)
        nearest = path[np.argmin(d, axis=1)]
        out = centroids - nearest
        return out

    return lookup


def ribbon(curve: np.ndarray, normals: np.ndarray, width: float, height: float, closed: bool = False, base: float = 0.0, sink: float = 0.0012) -> Mesh:
    """표면 곡선을 따라 솟은 납작한 띠(윗면 + 양 옆면, 열린 곡선은 끝면까지). 줄무늬·벨트 고리·파이핑에 쓴다.

    `curve`(k,3)는 표면 위 점, `normals`는 그 점의 바깥 법선. 띠 단면은 폭 `width`, 높이 `height`(표면 + `base`부터)이고 옆면은 표면 아래 `sink`까지 내려간다.
    속성 `uvw`: u = 곡선 호길이, v = 폭 방향(m).
    """
    curve = np.asarray(curve, dtype=np.float64)
    n = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    if closed:
        tangent = np.roll(curve, -1, axis=0) - np.roll(curve, 1, axis=0)
    else:
        tangent = np.gradient(curve, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-12)
    side = np.cross(n, tangent)
    side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-12)
    half = 0.5 * width
    lo_l = curve + side * half + n * (base - sink)
    hi_l = curve + side * half + n * (base + height)
    hi_r = curve - side * half + n * (base + height)
    lo_r = curve - side * half + n * (base - sink)
    rings = [lo_l, hi_l, hi_r, lo_r]
    mesh = ring_strip(rings, closed=closed, uv_v=[0.0, sink + height, sink + height + width, 2 * (sink + height) + width])
    center = curve + n * (base + 0.5 * height)
    columns = len(curve) + (1 if closed else 0)
    centers = np.concatenate([center, center[:1]]) if closed else center
    ref = np.tile(centers, (4, 1))
    mesh.triangles = orient_like(mesh.positions, mesh.triangles, lambda c: c - ref[np.argmin(((c[:, None, :] - ref[None, :, :]) ** 2).sum(axis=2), axis=1)])
    if not closed:
        extra_t = []
        for end, flip in ((0, True), (columns - 1, False)):
            quad = [k * columns + end for k in range(4)]
            tri = [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]]
            extra_t += [t[::-1] for t in tri] if flip else tri
        mesh.triangles = np.concatenate([mesh.triangles, np.array(extra_t, dtype=np.int64)])
        mesh.triangles = orient_like(mesh.positions, mesh.triangles, lambda c: c - ref[np.argmin(((c[:, None, :] - ref[None, :, :]) ** 2).sum(axis=2), axis=1)])
    return mesh


def lathe(profile: np.ndarray, center: np.ndarray, axis: np.ndarray, up: np.ndarray, segments: int = 16) -> Mesh:
    """(반지름, 높이) 단면을 축 둘레로 돌린 회전체(단추). 속성 `uvw`: 축에 수직인 평면 좌표(m)."""
    axis = axis / np.linalg.norm(axis)
    e1 = up - (up @ axis) * axis
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(axis, e1)
    angles = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
    rings = []
    uvw = []
    for r, h in profile:
        ring = center + h * axis + r * (np.outer(np.cos(angles), e1) + np.outer(np.sin(angles), e2))
        rings.append(ring)
        uvw.append(np.stack([r * np.cos(angles), r * np.sin(angles)], axis=1))
    positions = np.concatenate(rings)
    uvw = np.concatenate(uvw)
    triangles = []
    for k in range(len(profile) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            a, b = k * segments + i, k * segments + j
            c, d = (k + 1) * segments + i, (k + 1) * segments + j
            triangles += [[a, b, d], [a, d, c]]
    # 위아래 마개(반지름 0이 아니면 중심점으로)
    extra_p, extra_uv = [], []
    for k, flip in ((0, True), (len(profile) - 1, False)):
        if profile[k][0] <= 1e-9:
            continue
        ci = len(positions) + len(extra_p)
        extra_p.append(center + profile[k][1] * axis)
        extra_uv.append([0.0, 0.0])
        for i in range(segments):
            j = (i + 1) % segments
            a, b = k * segments + i, k * segments + j
            triangles.append([ci, b, a] if flip else [ci, a, b])
    if extra_p:
        positions = np.concatenate([positions, np.array(extra_p)])
        uvw = np.concatenate([uvw, np.array(extra_uv)])
    mesh = Mesh(positions, np.array(triangles, dtype=np.int64), {"uvw": uvw})
    mid = center + axis * float(np.mean([h for _, h in profile]))
    mesh.triangles = orient_like(mesh.positions, mesh.triangles, lambda c: c - (mid + np.outer((c - mid) @ axis, axis) * 0.0))
    return mesh


def button(center: np.ndarray, normal: np.ndarray, up: np.ndarray, radius: float, thickness: float, segments: int = 14) -> Mesh:
    """옷 표면에 붙은 단추: 둥근 가장자리의 납작한 원판(바닥은 표면 아래로 약간 묻힌다)."""
    r, t = radius, thickness
    profile = np.array([[0.0, -0.0008], [r * 0.92, -0.0008], [r, 0.25 * t], [r * 0.97, 0.75 * t], [r * 0.80, t], [r * 0.35, 0.92 * t], [0.0, 0.92 * t]])
    return lathe(profile, center, normal, up, segments)


def grid_normals(grid: np.ndarray) -> np.ndarray:
    """격자 면(R,C,3)의 정점 법선(du × dv 쪽, 단위 벡터)."""
    du = np.gradient(grid, axis=1)
    dv = np.gradient(grid, axis=0)
    n = np.cross(du, dv)
    return n / np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-12)


def solidify_grid(grid: np.ndarray, thickness: float, flip: bool = False, attrs: dict[str, np.ndarray] | None = None) -> Mesh:
    """격자 면(R,C,3)을 두께 판으로: 바깥면(du×dv 쪽, `flip`이면 반대) + 안쪽 면(바깥 법선 반대로 `thickness`) + 네 가장자리 벽.

    속성: `uvw`(격자 호길이 m — 안쪽 면은 바깥면과 같은 값, 벽은 가장자리 호길이 × 두께), `normal`(바깥·안쪽·벽마다 따로 정해
    조립 때 위치 용접으로 섞이지 않는다 → 판 모서리가 툰 램프에서 또렷하다), `attrs`로 준 격자 속성(R,C)(벽은 바깥면 정점 값).
    """
    R, C, _ = grid.shape
    n = grid_normals(grid) * (-1.0 if flip else 1.0)
    inner = grid - n * thickness
    seg_u = np.linalg.norm(np.diff(grid, axis=1), axis=2)
    u = np.concatenate([np.zeros((R, 1)), np.cumsum(seg_u, axis=1)], axis=1)
    seg_v = np.linalg.norm(np.diff(grid, axis=0), axis=2)
    v = np.concatenate([np.zeros((1, C)), np.cumsum(seg_v, axis=0)], axis=0)
    uv_grid = np.stack([u, v], axis=2).reshape(-1, 2)

    def surface_tris(offset: int, want: np.ndarray, positions: np.ndarray) -> np.ndarray:
        tris = []
        for r in range(R - 1):
            for c in range(C - 1):
                a = offset + r * C + c
                tris += [[a, a + 1, a + C + 1], [a, a + C + 1, a + C]]
        tris = np.array(tris, dtype=np.int64)
        p0, p1, p2 = (positions[tris[:, k]] for k in range(3))
        face = np.cross(p1 - p0, p2 - p0)
        vote = float(np.einsum("ij,ij->", face, want[tris[:, 0] - offset]))
        return tris if vote >= 0 else tris[:, [0, 2, 1]]

    outer_p = grid.reshape(-1, 3)
    inner_p = inner.reshape(-1, 3)
    n_flat = n.reshape(-1, 3)
    positions = [outer_p, inner_p]
    normals = [n_flat, -n_flat]
    uvs = [uv_grid, uv_grid.copy()]
    all_p = np.concatenate(positions)
    tris = [surface_tris(0, n_flat, all_p), surface_tris(R * C, -n_flat, all_p)]
    extra_attrs: dict[str, list[np.ndarray]] = {k: [np.asarray(val, dtype=np.float64).reshape(-1)] * 2 for k, val in (attrs or {}).items()}
    # 가장자리 고리(격자 번호): 아래 행 → 오른쪽 열 → 위 행(거꾸로) → 왼쪽 열(거꾸로). 벽 정점은 고리 정점마다 바깥·안쪽 둘(이웃 벽과 공유)
    ring = [(0, c) for c in range(C)] + [(r, C - 1) for r in range(1, R)] + [(R - 1, c) for c in range(C - 2, -1, -1)] + [(r, 0) for r in range(R - 2, 0, -1)]
    count = len(ring)
    edge_normals = np.zeros((count, 3))
    for k in range(count):
        (r0, c0), (r1, c1) = ring[k], ring[(k + 1) % count]
        po, qo = grid[r0, c0], grid[r1, c1]
        ri0, ci0 = min(max(r0, 1), R - 2), min(max(c0, 1), C - 2)
        ri1, ci1 = min(max(r1, 1), R - 2), min(max(c1, 1), C - 2)
        interior = 0.5 * (grid[ri0, ci0] + grid[ri1, ci1])
        wn = np.cross(qo - po, inner[r0, c0] - po)
        length = float(np.linalg.norm(wn))
        if length < 1e-14:
            continue
        wn /= length
        if float(wn @ (0.5 * (po + qo) - interior)) < 0:
            wn = -wn
        edge_normals[k] = wn
    vertex_normals_w = edge_normals + np.roll(edge_normals, 1, axis=0)
    vertex_normals_w /= np.maximum(np.linalg.norm(vertex_normals_w, axis=1, keepdims=True), 1e-12)
    ring_idx = np.array([r * C + c for r, c in ring], dtype=np.int64)
    wall_outer = outer_p[ring_idx]
    wall_inner = inner_p[ring_idx]
    arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(np.concatenate([wall_outer, wall_outer[:1]]), axis=0), axis=1))])
    # 고리를 닫는 마지막 변을 위해 첫 정점을 끝에 한 번 더 둔다(UV 이음매)
    wall_p = np.concatenate([wall_outer, wall_outer[:1], wall_inner, wall_inner[:1]])
    wall_n = np.concatenate([vertex_normals_w, vertex_normals_w[:1]] * 2)
    wall_uv = np.concatenate([np.stack([arc, np.zeros(count + 1)], axis=1), np.stack([arc, np.full(count + 1, thickness)], axis=1)])
    wall_src = np.concatenate([ring_idx, ring_idx[:1]] * 2)
    base = 2 * R * C
    wall_tris = []
    for k in range(count):
        if not np.any(edge_normals[k]):
            continue
        o0, o1 = base + k, base + k + 1
        i0, i1 = base + count + 1 + k, base + count + 1 + k + 1
        t1, t2 = [o0, o1, i1], [o0, i1, i0]
        p0, p1, p2 = wall_p[k], wall_p[k + 1], wall_p[count + 1 + k + 1]
        if float(np.cross(p1 - p0, p2 - p0) @ edge_normals[k]) < 0:
            t1, t2 = t1[::-1], t2[::-1]
        wall_tris += [t1, t2]
    if wall_tris:
        positions.append(wall_p)
        normals.append(wall_n)
        uvs.append(wall_uv)
        tris.append(np.array(wall_tris, dtype=np.int64))
        for key in extra_attrs:
            extra_attrs[key].append(extra_attrs[key][0][wall_src])
    mesh = Mesh(np.concatenate(positions), np.concatenate(tris), {"uvw": np.concatenate(uvs), "normal": np.concatenate(normals)})
    for key, chunks in extra_attrs.items():
        mesh.attrs[key] = np.concatenate(chunks)
    return mesh


def push_outside(points: np.ndarray, surface: Surface, normals: np.ndarray, gap: float, mask: np.ndarray | None = None) -> np.ndarray:
    """점들을 표면(정점 법선 `normals`, 바깥 쪽) 바깥 `gap` 이상으로 법선 방향으로 민다."""
    hits = surface.closest(points)
    corners = surface.triangles[np.maximum(hits.triangle, 0)]
    n = np.einsum("mc,mck->mk", hits.bary, normals[corners])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    d = np.einsum("ij,ij->i", points - hits.point, n)
    need = np.maximum(gap - d, 0.0)
    if mask is not None:
        need = need * mask
    return points + need[:, None] * n


# ---------------------------------------------------------------- 조각·변형


ROLES = ("main", "trim", "accent")
ROLE_COMPAT_SCALE = {"main": 1.0, "trim": 0.80, "accent": 0.66}


@dataclass
class Piece:
    """의상 한 조각.

    - `role`: 색 역할(`main` 본체 / `trim` 칼라·소매단·밑단선·단추·허리띠 / `accent` 타이·리본·줄무늬 포인트). 다역할 변형은 역할마다 메시·재질을 따로 쓴다.
    - `attach`: `body`(몸에 직접 결합하는 셸) / `carrier`(셸에 얹힌 디테일: 셸의 스킨·morph·형태 키를 이어받는다) / `skirt`(직접 짠 웨이트, `attrs["skin"]`).
    - `uv`: `unwrap`(정점 속성 `panel`로 나눈 판마다 각도 기반 전개) / `grid`(정점 속성 `uvw`, m 단위).
    - `paint(위치 (K,3), uvw (K,2), 변형)`: 상대 밝기(0..1). 없으면 `value`.
    - `compat_value`: 한 재질 변형(현재 계약)에서의 상대 밝기(없으면 역할별 기본 비율 × value).
    """

    name: str
    mesh: Mesh
    role: str = "main"
    attach: str = "body"
    uv: str = "unwrap"
    paint: Callable[[np.ndarray, np.ndarray, str], np.ndarray] | None = None
    value: float = 0.95
    compat_value: float | None = None
    ao_strength: float = 0.22
    smooth_group: str | None = None
    normal_smooth: int = 0  # 법선 라플라시안 평활 횟수(툰 램프 경계를 크고 매끈하게; 단차·주름 조각은 0)
    tags: dict[str, Any] = field(default_factory=dict)
    variants: tuple[str, ...] = ("compat", "layered")  # 이 조각을 쓰는 GLB 변형(블레이저의 셔츠 앞판은 compat 전용)

    def compat_scale(self) -> float:
        if self.compat_value is not None:
            return self.compat_value / max(self.value, 1e-6)
        return ROLE_COMPAT_SCALE[self.role]


@dataclass
class ShapeKey:
    """형태 슬라이더 `shape:<name>:±`. `delta(ctx, sign)` → (n,3) 원시 변위. 몸 관통은 조립 때 막는다(최소 오프셋 `d_min`)."""

    name: str
    delta: Callable[["ShapeContext", float], np.ndarray]
    d_min: float = 0.005
    note_ko: str = ""


@dataclass
class ShapeContext:
    body: "BaseBody"
    positions: np.ndarray
    normals: np.ndarray
    piece_of_vertex: np.ndarray
    pieces: list[Piece]
    attrs: dict[str, np.ndarray]

    def mask(self, *names: str) -> np.ndarray:
        ids = [i for i, p in enumerate(self.pieces) if p.name in names or any(p.name.startswith(n + ".") for n in names)]
        return np.isin(self.piece_of_vertex, ids)


# ---------------------------------------------------------------- 스킨·morph(체형 18)

BODY_MORPH_KEYS = ("height", "legLength", "armLength", "shoulderWidth", "neckLength", "headSize", "hip", "waist", "chestDepth")


def body_morph_names() -> list[str]:
    return [f"param:{key}:{sign}" for key in BODY_MORPH_KEYS for sign in ("+", "-")]


class BodyRig:
    """몸·머리의 스킨과 체형 morph 델타(검증기 V9와 같은 대응)를 의상 정점에 옮긴다."""

    def __init__(self, body: "BaseBody", names: list[str]) -> None:
        from character_kit.retarget_garment import build_body_surface

        self.body = body
        self.names = names
        self.bs = build_body_surface(body.model, names)
        normals = np.concatenate([body.raw_body["normals"], body.raw_head["normals"]]).astype(np.float64)
        self.normals = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
        self.surface_t = Surface(self.bs.tpose, self.bs.triangles)
        self.joint_count = len(body.joint_names)

    def skin(self, points: np.ndarray, normals: np.ndarray) -> np.ndarray:
        """법선 호환 최근접 몸 정점들의 웨이트를 조밀 배열 (n, 68)로."""
        joints, weights, _ = gf.compatible_vertex_skin(points, normals, self.bs.tpose, self.normals, self.bs.joints, self.bs.weights)
        return dense_from_top(joints, weights, self.joint_count)

    def deltas(self, points: np.ndarray, normals: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """(n, morph 수, 3) 위치 델타: TS_Body 최근접 정점(반경 6 cm, V9 대응)의 델타, 반경 밖은 법선 호환 표면 결합 보간."""
        from character_kit.retarget_garment import nearest_body_reference

        binding, _ = gf.bind_compatible(points, normals, self.surface_t)
        corners = self.bs.triangles[binding.triangle]
        reference = nearest_body_reference(points, self.bs)
        out = np.zeros((len(points), len(self.names), 3))
        for k, name in enumerate(self.names):
            bound = np.einsum("mc,mck->mk", binding.bary, self.bs.morphs[name][corners])
            out[:, k] = np.where(reference["found"][:, None], reference["deltas"][name], bound)
        return out, reference["found"]

    def joint_index(self, name: str) -> int:
        return self.body.joint_names.index(name if ":" in name or name.startswith("TS_") else f"mixamorig:{name}")


def dense_from_top(joints: np.ndarray, weights: np.ndarray, joint_count: int) -> np.ndarray:
    dense = np.zeros((len(joints), joint_count))
    rows = np.repeat(np.arange(len(joints)), joints.shape[1])
    np.add.at(dense, (rows, np.asarray(joints, dtype=np.int64).ravel()), np.asarray(weights, dtype=np.float64).ravel())
    return dense


def top_from_dense(dense: np.ndarray, influences: int = 4, cutoff: float = 0.01) -> tuple[np.ndarray, np.ndarray]:
    """조밀 웨이트 → 상위 4개(합 1). 아주 작은 영향(`cutoff` 미만)은 버리고, 가중치 0 슬롯의 joint 번호는 0으로 둔다(검증기 V8)."""
    order = np.argsort(-dense, axis=1, kind="stable")[:, :influences]
    top = np.take_along_axis(dense, order, axis=1)
    top[top < cutoff] = 0.0
    empty = top.sum(axis=1) <= 0.0
    top[empty, 0] = 1.0
    top = top / top.sum(axis=1, keepdims=True)
    order = np.where(top > 0.0, order, 0)
    return order.astype(np.int64), top


def interpolate_from_carrier(points: np.ndarray, carrier: Mesh, values: list[np.ndarray]) -> list[np.ndarray]:
    """점마다 운반 메시(셸) 최근접 표면점의 정점 값을 무게중심으로 보간한다."""
    surface = Surface(carrier.positions, carrier.triangles)
    hits = surface.closest(points)
    corners = carrier.triangles[np.maximum(hits.triangle, 0)]
    out = []
    for value in values:
        flat = value.reshape(len(value), -1)
        mixed = np.einsum("mc,mck->mk", hits.bary, flat[corners])
        out.append(mixed.reshape((len(points),) + value.shape[1:]))
    return out


# ---------------------------------------------------------------- UV: 판 전개(TEXCOORD_1 월드 축척) + 패킹(TEXCOORD_0)


def abf_unwrap(positions: np.ndarray, triangles: np.ndarray, panel: np.ndarray) -> np.ndarray:
    """판(삼각형 다수결 `panel`) 경계를 이음매로 표시하고 bpy 각도 기반 전개(ABF)로 코너 UV (M,3,2)를 돌려준다(축척·회전은 임의)."""
    import bpy

    tri_panel = panel[triangles]
    tri_label = np.array([np.bincount(row - row.min()).argmax() + row.min() for row in tri_panel])
    data = bpy.data.meshes.new("forge_abf")
    data.from_pydata(positions.tolist(), [], triangles.tolist())
    data.update()
    # 이음매: 서로 다른 판의 삼각형이 공유하는 변
    edge_index = {}
    for edge in data.edges:
        a, b = edge.vertices
        edge_index[(min(a, b), max(a, b))] = edge.index
    owner: dict[tuple[int, int], int] = {}
    seams = set()
    for t, tri in enumerate(triangles.tolist()):
        for i in range(3):
            a, b = tri[i], tri[(i + 1) % 3]
            key = (min(a, b), max(a, b))
            if key in owner and tri_label[owner[key]] != tri_label[t]:
                seams.add(key)
            owner[key] = t
    for key in seams:
        if key in edge_index:
            data.edges[edge_index[key]].use_seam = True
    obj = bpy.data.objects.new("forge_abf", data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.0, correct_aspect=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        raw = np.empty(len(data.loops) * 2, dtype=np.float32)
        data.uv_layers.active.data.foreach_get("uv", raw)
        loop_vertices = np.empty(len(data.loops), dtype=np.int64)
        data.loops.foreach_get("vertex_index", loop_vertices)
    finally:
        if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(data)
    corner_uv = raw.reshape(-1, 3, 2).astype(np.float64)
    corner_vertex = loop_vertices.reshape(-1, 3)
    if not np.array_equal(corner_vertex, triangles):
        # 면 순서는 같고 코너 시작점만 다를 수 있다 → 코너마다 정점 번호로 맞춘다
        fixed = np.zeros_like(corner_uv)
        for t in range(len(triangles)):
            for k in range(3):
                j = int(np.flatnonzero(corner_vertex[t] == triangles[t, k])[0])
                fixed[t, k] = corner_uv[t, j]
        corner_uv = fixed
    return corner_uv


def normalize_islands(corner_vertex: np.ndarray, corner_uv: np.ndarray, positions: np.ndarray) -> np.ndarray:
    """코너 UV 섬마다 월드 축척(1 = 1 m)으로 늘리고, 3D 위쪽(+y)이 UV −v 쪽이 되게 돌리고, 섬 중심을 정면 위치(x, −y) 근처로 옮긴다."""
    from character_kit import uvtools

    origin, uv, inverse = uvtools.split_by_uv(corner_vertex, corner_uv.astype(np.float32))
    tris = inverse.reshape(-1, 3)
    labels = component_labels(tris, len(uv))
    tri_label = labels[tris[:, 0]]
    uv = uv.astype(np.float64)
    out = uv.copy()
    for label in np.unique(tri_label):
        sel_t = tris[tri_label == label]
        verts = np.unique(sel_t)
        p = positions[origin]
        a3 = triangle_areas(p, sel_t).sum()
        u2 = uv[sel_t]
        a2 = 0.5 * np.abs((u2[:, 1, 0] - u2[:, 0, 0]) * (u2[:, 2, 1] - u2[:, 0, 1]) - (u2[:, 1, 1] - u2[:, 0, 1]) * (u2[:, 2, 0] - u2[:, 0, 0])).sum()
        if not (a2 > 1e-14 and np.isfinite(a2)) or a2 * 1e4 < a3 * 1e-3:
            # 전개 실패(섬이 한 점으로 모임): 섬 정점을 주성분 평면에 투영한다
            pts3 = p[verts] - p[verts].mean(axis=0)
            _, _, vt = np.linalg.svd(pts3, full_matrices=False)
            uv[verts] = pts3 @ vt[:2].T
            u2 = uv[sel_t]
            a2 = 0.5 * np.abs((u2[:, 1, 0] - u2[:, 0, 0]) * (u2[:, 2, 1] - u2[:, 0, 1]) - (u2[:, 1, 1] - u2[:, 0, 1]) * (u2[:, 2, 0] - u2[:, 0, 0])).sum()
        scale = math.sqrt(a3 / a2) if a2 > 1e-18 else 1.0
        local = (uv[verts] - uv[verts].mean(axis=0)) * scale
        # y의 UV 기울기(면적 가중 평균) → 그 방향을 −v로
        e1 = u2[:, 1] - u2[:, 0]
        e2 = u2[:, 2] - u2[:, 0]
        dy1 = p[sel_t[:, 1], 1] - p[sel_t[:, 0], 1]
        dy2 = p[sel_t[:, 2], 1] - p[sel_t[:, 0], 1]
        det = e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]
        ok = np.abs(det) > 1e-14
        gx = np.where(ok, (dy1 * e2[:, 1] - dy2 * e1[:, 1]) / np.where(ok, det, 1.0), 0.0)
        gy = np.where(ok, (e1[:, 0] * dy2 - e2[:, 0] * dy1) / np.where(ok, det, 1.0), 0.0)
        tri_area = triangle_areas(p, sel_t)
        grad = np.array([(gx * tri_area).sum(), (gy * tri_area).sum()])
        if np.linalg.norm(grad) > 1e-12:
            angle = math.atan2(grad[1], grad[0])
            rotate = -math.pi / 2 - angle  # grad 방향 → (0, −1)
            c, s = math.cos(rotate), math.sin(rotate)
            local = local @ np.array([[c, -s], [s, c]]).T
        centroid = p[verts].mean(axis=0)
        out[verts] = local + np.array([centroid[0], -centroid[1]])
    result = np.zeros_like(corner_uv)
    result.reshape(-1, 2)[:] = out[inverse]
    return result


def piece_corner_uv(piece: Piece) -> np.ndarray:
    """조각의 코너 UV (M,3,2), 월드 축척(m)."""
    mesh = piece.mesh
    if piece.uv == "grid":
        uvw = mesh.attrs["uvw"].astype(np.float64)
        return uvw[mesh.triangles]
    panel = mesh.attrs.get("panel")
    if panel is None:
        panel = np.zeros(mesh.count, dtype=np.int64)
    raw = abf_unwrap(mesh.positions, mesh.triangles, panel.astype(np.int64))
    return normalize_islands(mesh.triangles, raw, mesh.positions)


def pack_atlas(world_uv: np.ndarray, triangles: np.ndarray, margin: float = 0.004) -> np.ndarray:
    """월드 UV 섬을 0..1 아틀라스로 패킹한다(모든 섬 같은 축척 = 텍셀 밀도 균일, 회전 허용)."""
    from character_kit import uvtools

    return uvtools.pack_uv_islands(world_uv.astype(np.float32), triangles, margin=margin).astype(np.float64)


# ---------------------------------------------------------------- 텍스처 굽기(상대색)


def rasterize_attributes(uv: np.ndarray, triangles: np.ndarray, corner_values: np.ndarray, size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """UV 삼각형을 래스터해 텍셀마다 코너 값(T,3,C)을 무게중심 보간한다. (텍셀 y (K,), x (K,), 값 (K,C), 삼각형 번호 (K,))."""
    scaled = uv * size
    ys, xs, vals, owners = [], [], [], []
    channels = corner_values.shape[2]
    for t in range(len(triangles)):
        a, b, c = scaled[triangles[t, 0]], scaled[triangles[t, 1]], scaled[triangles[t, 2]]
        area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if abs(area) < 1e-12:
            continue
        x0 = max(0, int(math.floor(min(a[0], b[0], c[0]))) - 1)
        x1 = min(size - 1, int(math.ceil(max(a[0], b[0], c[0]))) + 1)
        y0 = max(0, int(math.floor(min(a[1], b[1], c[1]))) - 1)
        y1 = min(size - 1, int(math.ceil(max(a[1], b[1], c[1]))) + 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        inv = 1.0 / area
        w0 = ((b[0] - gx) * (c[1] - gy) - (b[1] - gy) * (c[0] - gx)) * inv
        w1 = ((c[0] - gx) * (a[1] - gy) - (c[1] - gy) * (a[0] - gx)) * inv
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -0.04) & (w1 >= -0.04) & (w2 >= -0.04)
        if not inside.any():
            continue
        wv = np.clip(np.stack([w0[inside], w1[inside], w2[inside]], axis=1), 0.0, None)
        wv /= np.maximum(wv.sum(axis=1, keepdims=True), 1e-12)
        ys.append(gy[inside].astype(np.int64))
        xs.append(gx[inside].astype(np.int64))
        vals.append(wv @ corner_values[t])
        owners.append(np.full(len(wv), t, dtype=np.int64))
    if not ys:
        return np.zeros(0, dtype=np.int64), np.zeros(0, dtype=np.int64), np.zeros((0, channels)), np.zeros(0, dtype=np.int64)
    return np.concatenate(ys), np.concatenate(xs), np.concatenate(vals), np.concatenate(owners)


def dilate_fill(image: np.ndarray, mask: np.ndarray, pixels: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """섬 밖 텍셀을 이웃 섬 값으로 `pixels`번 넓혀 채운다(밉맵 번짐 방지)."""
    out = image.copy()
    filled = mask.copy()
    for _ in range(pixels):
        acc = np.zeros_like(out)
        cnt = np.zeros(out.shape, dtype=np.float64)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(out * filled, dy, axis=0), dx, axis=1)
            cnt += np.roll(np.roll(filled, dy, axis=0), dx, axis=1)
        grow = (~filled) & (cnt > 0)
        out[grow] = acc[grow] / cnt[grow]
        filled = filled | grow
    return out, filled


def line_profile(values: np.ndarray, level: float, half_width: float, soft: float = 0.0005) -> np.ndarray:
    """`values == level` 둘레 `half_width` 안을 1로(가장자리 `soft`만큼 부드럽게)."""
    d = np.abs(np.asarray(values, dtype=np.float64) - level)
    return 1.0 - smoothstep(half_width, half_width + soft, d)


def dash_profile(coordinate: np.ndarray, period: float, duty: float = 0.62) -> np.ndarray:
    phase = np.mod(np.asarray(coordinate, dtype=np.float64) / period, 1.0)
    return smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(duty, duty + 0.08, phase))


def hash_noise(points: np.ndarray, scale: float, seed: int = 3) -> np.ndarray:
    """결정적 값 노이즈(3D 격자 해시, −1..1)."""
    q = np.asarray(points, dtype=np.float64) / scale
    base = np.floor(q).astype(np.int64)
    frac = q - base
    frac = frac * frac * (3.0 - 2.0 * frac)

    def h(ix: np.ndarray, iy: np.ndarray, iz: np.ndarray) -> np.ndarray:
        v = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
        v = (v ^ (v >> 13)) * 1274126177
        return ((v & 0xFFFF).astype(np.float64) / 32767.5) - 1.0

    out = np.zeros(len(q))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (frac[:, 0] if dx else 1 - frac[:, 0]) * (frac[:, 1] if dy else 1 - frac[:, 1]) * (frac[:, 2] if dz else 1 - frac[:, 2])
                out += w * h(base[:, 0] + dx, base[:, 1] + dy, base[:, 2] + dz)
    return out


def bake_texture(
    positions: np.ndarray,
    uv0: np.ndarray,
    uv1: np.ndarray,
    triangles: np.ndarray,
    piece_of_vertex: np.ndarray,
    ao: np.ndarray,
    pieces: list[Piece],
    variant: str,
    size: int = 1024,
    min_mean: float = 0.80,
    quality: int = 90,
) -> tuple[bytes, dict]:
    """텍셀마다 3D 위치·월드 UV·AO를 보간해 조각의 무늬 함수로 상대 밝기를 정하고 JPEG로 굽는다.

    `variant`가 `compat`(한 재질)이면 역할별 상대 밝기(`Piece.compat_scale`)를 곱해 칼라·소매단·리본이 같은 틴트 아래에서도 구분되게 하고,
    `layered`(역할마다 재질)이면 역할마다 따로 색을 받으므로 밝은 상대색(디테일 명암만)으로 굽는다.
    """
    from PIL import Image

    corner = np.concatenate([positions, uv1, ao[:, None]], axis=1)[triangles]  # (T,3,6)
    ty, tx, values, owner = rasterize_attributes(uv0, triangles, corner, size)
    texel_piece = piece_of_vertex[triangles[owner, 0]]
    shade = np.ones(len(ty))
    for index, piece in enumerate(pieces):
        sel = texel_piece == index
        if not sel.any():
            continue
        pts = values[sel, 0:3]
        uvw = values[sel, 3:5]
        base = piece.paint(pts, uvw, variant) if piece.paint is not None else np.full(int(sel.sum()), piece.value)
        if variant == "compat":
            base = base * piece.compat_scale()
        occlusion = 1.0 - piece.ao_strength * (1.0 - np.clip(values[sel, 5], 0.0, 1.0))
        shade[sel] = np.clip(base * occlusion, 0.0, 1.0)
    image = np.zeros((size, size))
    mask = np.zeros((size, size), dtype=bool)
    image[ty, tx] = shade
    mask[ty, tx] = True
    used_mean = float(image[mask].mean()) if mask.any() else 1.0
    lift = 0.0
    if used_mean < min_mean:
        lift = (min_mean - used_mean) / max(1.0 - used_mean, 1e-6)
        image[mask] = image[mask] + (1.0 - image[mask]) * lift
        used_mean = float(image[mask].mean())
    filled_image, filled = dilate_fill(image, mask, 8)
    filled_image[~filled] = used_mean
    gray = np.clip(filled_image * 255.0 + 0.5, 0, 255).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(np.stack([gray, gray, gray], axis=-1), mode="RGB").save(buffer, format="JPEG", quality=quality, subsampling=0, optimize=True)
    data = buffer.getvalue()
    stats = {"bytes": len(data), "size": size, "usedFraction": round(float(mask.mean()), 4), "meanUsed": round(used_mean, 4), "meanAll": round(float(filled_image.mean()), 4), "lift": round(lift, 4)}
    return data, stats


def vertex_ao(positions: np.ndarray, normals: np.ndarray, occluders: list[Surface], rays: int = 16, distance: float = 0.035, seed: int = 5) -> np.ndarray:
    """정점마다 법선 반구로 쏜 광선이 `distance` 안에서 가려지는 비율로 주변 가림(1 = 트임)을 잰다(코사인 가중)."""
    rng = np.random.default_rng(seed)
    directions = rng.normal(size=(rays, 3))
    directions /= np.linalg.norm(directions, axis=1, keepdims=True)
    hidden = np.zeros(len(positions))
    total = np.zeros(len(positions))
    origins = positions + normals * 0.0015
    for d in directions:
        cos = normals @ d
        dirs = np.where(cos[:, None] >= 0.0, d[None, :], -d[None, :])
        weight = np.abs(cos)
        blocked = np.zeros(len(positions), dtype=bool)
        for surface in occluders:
            _, tri = surface.ray(origins, dirs, distance)
            blocked |= tri >= 0
        hidden += weight * blocked
        total += weight
    return 1.0 - hidden / np.maximum(total, 1e-9)


# ---------------------------------------------------------------- 조립


@dataclass
class GarmentPlan:
    """의상 한 벌의 생성 결과(조립 전): 조각, 형태 키, 레이어, 메모."""

    slot: str  # top | bottom | outer
    name: str
    layer: int  # 0 이너 · 1 상의/하의 · 2 아우터
    pieces: list[Piece]
    shape_keys: list[ShapeKey] = field(default_factory=list)
    shape_constraints: list[Callable[[np.ndarray], np.ndarray]] = field(default_factory=list)
    notes: dict[str, Any] = field(default_factory=dict)


@dataclass
class AssembledGarment:
    plan: GarmentPlan
    positions: np.ndarray  # (n,3) 쪼개기 전
    normals: np.ndarray
    triangles: np.ndarray
    piece_of_vertex: np.ndarray
    joints: np.ndarray
    weights: np.ndarray
    body_deltas: np.ndarray  # (n,18,3)
    shape_deltas: np.ndarray  # (n,K*2,3)
    shape_names: list[str]
    origin: np.ndarray  # 쪼갠 정점 → 원래 정점
    split_triangles: np.ndarray
    uv0: np.ndarray
    uv1: np.ndarray
    textures: dict[str, bytes]
    report: dict[str, Any]


def piece_normals_all(pieces: list[Piece], body: "BaseBody") -> list[np.ndarray]:
    """조각별 정점 법선. 같은 `smooth_group` 조각끼리는 위치로 합쳐 이어진 법선을 쓰고, `normal_smooth`만큼 이웃 평균으로 다듬는다."""
    groups: dict[str, list[int]] = {}
    for i, p in enumerate(pieces):
        groups.setdefault(p.smooth_group or f"__{i}", []).append(i)
    out: list[np.ndarray | None] = [None] * len(pieces)
    for members in groups.values():
        merged = merge_meshes([pieces[i].mesh for i in members])
        index, welded = gf.weld_vertices(merged.positions, 1e-7)
        tris = index[merged.triangles]
        normals_w = vertex_normals(welded, tris)
        iterations = max(pieces[i].normal_smooth for i in members)
        if iterations > 0:
            ptr, idx = vertex_neighbors(tris, len(welded))
            normals_w = laplacian_values(normals_w, ptr, idx, iterations, 0.5)
            normals_w /= np.maximum(np.linalg.norm(normals_w, axis=1, keepdims=True), 1e-12)
        normals = normals_w[index]
        offset = 0
        for i in members:
            n = normals[offset : offset + pieces[i].mesh.count]
            given = pieces[i].mesh.attrs.get("normal")
            if given is not None:
                use = np.linalg.norm(given, axis=1) > 0.5
                n = np.where(use[:, None], given, n)
            out[i] = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            offset += pieces[i].mesh.count
    return [n for n in out]  # type: ignore[misc]


def finalize_shape_delta(body: "BaseBody", positions: np.ndarray, delta: np.ndarray, d_min: float, triangles: np.ndarray, extra: list[Callable[[np.ndarray], np.ndarray]]) -> np.ndarray:
    """형태 키 끝값(위치 + 변위)이 몸에서 `d_min` 안으로 들어가지 않게(그리고 아래 레이어 밖에 있게) 고친 변위."""
    moved = positions + delta
    for _ in range(3):
        d, normal = body.signed_distance(moved)
        push = np.maximum(d_min - d, 0.0)
        moved = moved + push[:, None] * normal
        for constraint in extra:
            moved = constraint(moved)
    d, normal = body.signed_distance(moved)  # 몸 최소 거리가 마지막(아래 레이어 밀어내기 뒤)
    moved = moved + np.maximum(d_min - d, 0.0)[:, None] * normal
    return moved - positions


SHOULDER_SMOOTH_RADIUS_M = 0.11  # 어깨 관절에서 이 거리 안(겨드랑이 위)의 셸 정점은 웨이트를 더 섞는다
SHOULDER_SMOOTH_ITERATIONS = 12


def assemble(body: "BaseBody", rig: BodyRig, plan: GarmentPlan, texture_size: int = 1024) -> AssembledGarment:
    """조각을 합쳐 스킨·체형 morph·형태 키·AO·UV 두 벌·텍스처(두 변형)를 만든다."""
    from character_kit.base_assembly import ensure_min_delta
    from character_kit.retarget_garment import fade_small

    pieces = [p for p in plan.pieces if p.mesh.count and len(p.mesh.triangles)]
    for p in pieces:
        p.mesh = drop_degenerate(p.mesh)
    pieces = [p for p in pieces if p.mesh.count and len(p.mesh.triangles)]
    normals_list = piece_normals_all(pieces, body)
    offsets = np.cumsum([0] + [p.mesh.count for p in pieces])
    positions = np.concatenate([p.mesh.positions for p in pieces])
    normals = np.concatenate(normals_list)
    rig_normals = outward(normals, positions, body)  # 스킨·morph 대응은 몸 바깥을 보는 법선으로(안쪽 시접 면이 반대편 몸에 붙지 않게)
    triangles = np.concatenate([p.mesh.triangles + offsets[i] for i, p in enumerate(pieces)])
    piece_of_vertex = np.concatenate([np.full(p.mesh.count, i) for i, p in enumerate(pieces)])
    names = rig.names

    # -- 스킨·체형 morph
    dense = np.zeros((len(positions), rig.joint_count))
    deltas = np.zeros((len(positions), len(names), 3))
    matched = np.zeros(len(positions), dtype=bool)
    body_ids = [i for i, p in enumerate(pieces) if p.attach == "body"]
    skirt_ids = [i for i, p in enumerate(pieces) if p.attach == "skirt"]
    detail_ids = [i for i, p in enumerate(pieces) if p.attach == "carrier"]
    shoulders = [body.joint("LeftArm"), body.joint("RightArm")]
    for i in body_ids:
        sl = slice(offsets[i], offsets[i + 1])
        dense[sl] = rig.skin(positions[sl], rig_normals[sl])
        deltas[sl], matched[sl] = rig.deltas(positions[sl], rig_normals[sl])
        ptr, idx = vertex_neighbors(pieces[i].mesh.triangles, pieces[i].mesh.count)
        dense[sl] = laplacian_values(dense[sl], ptr, idx, 2, 0.4)
        # 어깨 캡: 몸 웨이트를 그대로 옮기면 팔을 내릴 때(A-포즈) 몸에서 뜬 천이 선형 블렌딩으로 혹처럼 부푼다 → 어깨 관절 둘레만 웨이트를 더 넓게 섞는다
        p = positions[sl]
        near = np.zeros(len(p), dtype=bool)
        for joint in shoulders:
            near |= np.linalg.norm(p - joint, axis=1) < SHOULDER_SMOOTH_RADIUS_M
        near &= p[:, 1] > body.landmarks.armpit_y - 0.02
        if near.any():
            dense[sl] = laplacian_values(dense[sl], ptr, idx, SHOULDER_SMOOTH_ITERATIONS, 0.5, fixed=~near)
        if pieces[i].tags.get("sleeveless"):
            # 민소매: 어깨끈 끝이 위팔 본을 다 받으면 팔을 내릴 때 위로 젖혀지고, 다 빼면 내려간 어깨 위로 뜬다 → 팔·손 본 영향을 40 %로 줄인다
            # (쇄골 LeftShoulder는 그대로, 줄인 몫은 가슴 본 Spine2로)
            arm_cols = [k for k, n in enumerate(body.joint_names) if any(t in n for t in ("Arm", "Hand")) and "Shoulder" not in n]
            block = dense[sl]
            arm = block[:, arm_cols].sum(axis=1)
            block[:, arm_cols] *= 0.4
            spine = body.joint_names.index("mixamorig:Spine2")
            block[:, spine] += 0.6 * arm
            dense[sl] = block / np.maximum(block.sum(axis=1, keepdims=True), 1e-9)
    for i in skirt_ids:
        sl = slice(offsets[i], offsets[i + 1])
        dense[sl] = pieces[i].mesh.attrs["skin"]
        d, found = rig.deltas(positions[sl], rig_normals[sl])
        ptr, idx = vertex_neighbors(pieces[i].mesh.triangles, pieces[i].mesh.count)
        d = laplacian_values(d, ptr, idx, 60, 0.5, fixed=found)
        deltas[sl], matched[sl] = d, found
    carrier_ids = body_ids + skirt_ids
    if detail_ids and carrier_ids:
        carrier = merge_meshes([pieces[i].mesh for i in carrier_ids])
        carrier_rows = np.concatenate([np.arange(offsets[i], offsets[i + 1]) for i in carrier_ids])
        rows = np.concatenate([np.arange(offsets[i], offsets[i + 1]) for i in detail_ids])
        mixed_dense, mixed_delta = interpolate_from_carrier(positions[rows], carrier, [dense[carrier_rows], deltas[carrier_rows]])
        # 체형 morph는 6 cm 안에 몸 정점이 있으면 그 정점의 델타(검증기 V9와 같은 대응)를 쓴다 — 셸 보간만 쓰면 소매단·립·밑단 띠가
        # 자기 최근접 몸 정점과 수 mm 어긋난다(V9 경고). 스킨 웨이트는 셸 보간을 유지해 포즈에서 셸과 같이 움직인다.
        ref_delta, ref_found = rig.deltas(positions[rows], rig_normals[rows])
        dense[rows] = mixed_dense
        deltas[rows] = np.where(ref_found[:, None, None], ref_delta, mixed_delta)
        matched[rows] = ref_found
    joints, weights = top_from_dense(dense)
    applied: list[str] = []
    for k, morph in enumerate(names):
        deltas[:, k] = ensure_min_delta(fade_small(deltas[:, k]), morph, positions, applied, plan.name)

    # -- 형태 키
    merged_attrs: dict[str, np.ndarray] = {}
    for key in {k for p in pieces for k, v in p.mesh.attrs.items() if np.ndim(v) == 1 and np.issubdtype(np.asarray(v).dtype, np.floating)}:
        full = np.full(len(positions), np.nan)
        for i, p in enumerate(pieces):
            if key in p.mesh.attrs and np.ndim(p.mesh.attrs[key]) == 1:
                full[offsets[i] : offsets[i + 1]] = p.mesh.attrs[key]
        merged_attrs[key] = full
    ctx = ShapeContext(body, positions, rig_normals, piece_of_vertex, pieces, merged_attrs)
    shape_names: list[str] = []
    shape_list: list[np.ndarray] = []
    # 디테일(셸에 얹힌 조각)은 형태 키도 셸의 최종 변위를 무게중심 보간으로 이어받는다 — 따로 몸·아래 레이어 제약을 걸면
    # 셸만 밀려 나와 주머니·커프스·라펠이 셸 속으로 묻힌다(스킨과 같은 원리)
    carrier_mask = np.isin(piece_of_vertex, carrier_ids)
    detail_mask = np.isin(piece_of_vertex, detail_ids)
    carrier_mesh = merge_meshes([pieces[i].mesh for i in carrier_ids]) if carrier_ids else None
    carrier_rows_all = np.flatnonzero(carrier_mask)
    detail_rest_d = body.signed_distance(positions[detail_mask])[0] if detail_mask.any() else np.zeros(0)
    for key in plan.shape_keys:
        for sign, label in ((1.0, "+"), (-1.0, "-")):
            raw = key.delta(ctx, sign)
            fixed = finalize_shape_delta(body, positions, raw, key.d_min, triangles, plan.shape_constraints)
            if carrier_mesh is not None and detail_mask.any():
                # 칼라·라펠처럼 키가 직접 모양을 바꾸는 판은 몸 결합 조각이라 운반체에 들어 있고, 그 위 줄무늬·파이핑은 가장 가까운 판을 따라간다
                inherited = interpolate_from_carrier(positions[detail_mask], carrier_mesh, [fixed[carrier_rows_all]])[0]
                # 셸보다 몸 쪽에 있는 디테일(세일러 가리개·접힌 단 안쪽 고리)은 셸이 몸 하한까지만 밀려도 몸에 닿을 수 있다 → 디테일마다 몸 하한
                moved = positions[detail_mask] + inherited
                d_new, n_new = body.signed_distance(moved)
                floor = np.minimum(np.maximum(detail_rest_d, 0.0015), key.d_min)
                fixed[detail_mask] = inherited + np.maximum(floor - d_new, 0.0)[:, None] * n_new
            shape_names.append(f"shape:{key.name}:{label}")
            shape_list.append(fade_small(fixed))
    shape_deltas = np.stack(shape_list, axis=1) if shape_list else np.zeros((len(positions), 0, 3))

    # -- AO, UV
    garment_surface = Surface(positions, triangles)
    ao = vertex_ao(positions, normals, [garment_surface, body.surface])
    for i, p in enumerate(pieces):
        sl = slice(offsets[i], offsets[i + 1])
        ptr, idx = vertex_neighbors(p.mesh.triangles, p.mesh.count)
        ao[sl] = laplacian_values(ao[sl], ptr, idx, 3, 0.5)
    corner_uv = np.concatenate([piece_corner_uv(p) for p in pieces])
    from character_kit import uvtools

    origin, uv1, inverse = uvtools.split_by_uv(triangles, corner_uv.astype(np.float32))
    uv1 = uv1.astype(np.float64)
    split_triangles = inverse.reshape(-1, 3)
    uv0 = pack_atlas(uv1, split_triangles)
    textures: dict[str, bytes] = {}
    texture_stats: dict[str, Any] = {}
    for variant in ("compat", "layered"):
        data, stats = bake_texture(positions[origin], uv0, uv1, split_triangles, piece_of_vertex[origin], ao[origin], pieces, variant, size=texture_size)
        textures[variant] = data
        texture_stats[variant] = stats
    report = {
        "pieces": {f"{i}:{p.name}": {"vertices": int(p.mesh.count), "triangles": int(len(p.mesh.triangles)), "role": p.role, "attach": p.attach} for i, p in enumerate(pieces)},
        "vertices": int(len(origin)),
        "triangles": int(len(split_triangles)),
        "texture": texture_stats,
        "floorsApplied": applied,
        "matchedFraction": round(float(matched.mean()), 4),
        "shapeKeys": shape_names,
        "_pieces": pieces,
    }
    return AssembledGarment(plan, positions, normals, triangles, piece_of_vertex, joints, weights, deltas, shape_deltas, shape_names, origin, split_triangles, uv0, uv1, textures, report)


# ---------------------------------------------------------------- GLB 쓰기(두 변형)

SLOT_NODE_PREFIX = {"top": "TS_Top", "bottom": "TS_Bottom", "outer": "TS_Outer", "accessory": "TS_Accessory"}
ROLE_SUFFIX = {"main": "", "trim": "_Trim", "accent": "_Accent"}
ROLE_MATERIAL_SUFFIX = {"main": "", "trim": "_trim", "accent": "_accent"}


def role_name(slot: str, role: str) -> str:
    """다역할 변형의 계약 역할 이름 제안: top / top-trim / top-accent, bottom / bottom-trim, outer / outer-trim / outer-accent."""
    return slot if role == "main" else f"{slot}-{role}"


def quantize_weights(weights: np.ndarray) -> np.ndarray:
    """가중치(합 1, (N,4))를 정규화 UNSIGNED_SHORT로: 합이 정확히 65535가 되게 나머지를 가장 큰 가중치에 더한다(검증기 V8 합 허용 오차 안)."""
    w = np.clip(np.asarray(weights, dtype=np.float64), 0.0, 1.0)
    w = w / np.maximum(w.sum(axis=1, keepdims=True), 1e-12)
    q = np.floor(w * 65535.0).astype(np.int64)
    rest = 65535 - q.sum(axis=1)
    top = np.argmax(w, axis=1)
    q[np.arange(len(q)), top] += rest
    return q.astype(np.uint16)


def garment_writer() -> Any:
    """morph는 정규화 SHORT(`KHR_mesh_quantization`), WEIGHTS_0은 정규화 UNSIGNED_SHORT(glTF 핵심 규격, 정점당 8바이트 절약)로 쓰는 GLB 작성기."""
    from character_kit.base_assembly import QuantizedGlbWriter

    class GarmentGlbWriter(QuantizedGlbWriter):
        def add_accessor(self, array: np.ndarray, *args: Any, **kwargs: Any) -> int:  # type: ignore[override]
            array = np.asarray(array)
            # 스킨 메시 정점 속성 중 (N,4) float32는 WEIGHTS_0뿐이다(COLOR_0은 쓰지 않는다)
            if array.dtype == np.float32 and array.ndim == 2 and array.shape[1] == 4 and not kwargs.get("normalized"):
                kwargs["normalized"] = True
                return super().add_accessor(quantize_weights(array), *args, **kwargs)
            return super().add_accessor(array, *args, **kwargs)

    return GarmentGlbWriter(generator="toonstudio character_kit forge_garments")


def write_variant(asm: AssembledGarment, body: "BaseBody", path: Path, variant: str, pieces_from: str | None = None, slot_override: str | None = None) -> dict[str, Any]:
    """`compat`: 메시 하나·재질 하나·체형 morph 18(현재 계약). `layered`: 역할마다 메시·재질(텍스처 공유)·체형 18 + 형태 키, 모두 TEXCOORD_1(월드 UV) 포함."""
    from character_kit.glbwriter import MorphTarget, Primitive

    plan = asm.plan
    writer = garment_writer()
    names = body.joint_names
    parents = {n: (None if p < 0 else names[p]) for n, p in zip(names, body.joint_parents, strict=True)}
    writer.add_skeleton(names, parents, body.J)
    texture = writer.add_texture(asm.textures[variant], "image/jpeg", name=f"ts_{plan.slot}_{plan.name}_basecolor")
    o = asm.origin
    split_piece = asm.piece_of_vertex[o]
    pieces = asm.report["_pieces"]
    tri_piece = split_piece[asm.split_triangles[:, 0]]
    tri_role = np.array([pieces[i].role for i in tri_piece])
    in_variant = np.array([(pieces_from or variant) in pieces[i].variants for i in tri_piece])  # `pieces_from`: 다른 변형의 조각 집합을 이 형식으로
    groups = [("main", in_variant)] if variant == "compat" else [(r, (tri_role == r) & in_variant) for r in ROLES if ((tri_role == r) & in_variant).any()]
    morph_names = body_morph_names()
    all_deltas = asm.body_deltas
    if variant == "layered" and asm.shape_names:
        morph_names = morph_names + asm.shape_names
        all_deltas = np.concatenate([asm.body_deltas, asm.shape_deltas], axis=1)
    meshes_report = []
    compat_slot = slot_override or ("top" if plan.slot == "outer" else plan.slot)  # `slot_override`: QA 미리보기용(현재 엔진에 아우터를 액세서리 슬롯으로 얹기)
    prefix = SLOT_NODE_PREFIX[plan.slot] if variant == "layered" else SLOT_NODE_PREFIX[compat_slot]
    material_slot = plan.slot if variant == "layered" else compat_slot
    for role, tri_mask in groups:
        tris = asm.split_triangles[tri_mask]
        used = np.unique(tris)
        remap = np.full(len(o), -1, dtype=np.int64)
        remap[used] = np.arange(len(used))
        node = f"{prefix}_{plan.name}{ROLE_SUFFIX[role]}"
        material_name = f"ts_{material_slot}_{plan.name}{ROLE_MATERIAL_SUFFIX[role]}"
        material = writer.add_material(material_name, base_color_texture=texture, base_color_factor=(1.0, 1.0, 1.0, 1.0), double_sided=True, metallic=0.0, roughness=0.8)
        src = o[used]
        targets = [MorphTarget(name=n, position=all_deltas[src, k].astype(np.float32)) for k, n in enumerate(morph_names)]
        node_index = writer.add_mesh_node(
            node,
            [
                Primitive(
                    positions=asm.positions[src].astype(np.float32),
                    indices=remap[tris].astype(np.uint32),
                    normals=asm.normals[src].astype(np.float32),
                    uvs=asm.uv0[used].astype(np.float32),
                    joints=asm.joints[src].astype(np.uint8),
                    weights=asm.weights[src].astype(np.float32),
                    material=material,
                    targets=targets,
                )
            ],
            skinned=True,
        )
        accessor = writer.add_accessor(asm.uv1[used].astype(np.float32), target=34962)
        mesh_index = writer._json["nodes"][node_index]["mesh"]
        writer._json["meshes"][mesh_index]["primitives"][0]["attributes"]["TEXCOORD_1"] = accessor
        meshes_report.append({"node": node, "material": material_name, "role": role_name(plan.slot if variant == "layered" else material_slot, role), "vertices": int(len(used)), "triangles": int(len(tris))})
    path.parent.mkdir(parents=True, exist_ok=True)
    size = writer.write(str(path))
    return {"path": str(path), "bytes": size, "meshes": meshes_report, "morphs": morph_names}


# ---------------------------------------------------------------- 공통: 솔기·무늬 장


class PolylineField:
    """3D 점 열(솔기·스티치 기준선) 까지의 거리장(KD-트리)."""

    def __init__(self, points: np.ndarray) -> None:
        from mathutils import kdtree

        self.points = np.asarray(points, dtype=np.float64)
        self.tree = kdtree.KDTree(max(1, len(self.points)))
        for i, p in enumerate(self.points.tolist()):
            self.tree.insert(p, i)
        self.tree.balance()

    def distance(self, queries: np.ndarray) -> np.ndarray:
        if len(self.points) == 0:
            return np.full(len(queries), np.inf)
        return np.array([self.tree.find(q)[2] for q in np.asarray(queries, dtype=np.float64).tolist()])


def densify(points: np.ndarray, step: float = 0.0015, closed: bool = False) -> np.ndarray:
    pts = np.concatenate([points, points[:1]]) if closed else points
    out = []
    for a, b in zip(pts[:-1], pts[1:], strict=True):
        n = max(1, int(math.ceil(np.linalg.norm(b - a) / step)))
        out.append(a + (b - a) * (np.arange(n) / n)[:, None])
    out.append(pts[-1:])
    return np.concatenate(out)


def panel_seam_points(mesh: Mesh, panel: np.ndarray, step: float = 0.0015) -> np.ndarray:
    """판 라벨이 다른 삼각형이 만나는 변(솔기)을 촘촘한 점 열로."""
    tri_label = np.array([np.bincount(row - row.min()).argmax() + row.min() for row in panel[mesh.triangles]])
    owner: dict[tuple[int, int], int] = {}
    seams = []
    for t, tri in enumerate(mesh.triangles.tolist()):
        for i in range(3):
            a, b = tri[i], tri[(i + 1) % 3]
            key = (min(a, b), max(a, b))
            if key in owner and tri_label[owner[key]] != tri_label[t]:
                seams.append(key)
            owner[key] = t
    out = [densify(mesh.positions[[a, b]], step) for a, b in seams]
    return np.concatenate(out) if out else np.zeros((0, 3))


def knit_noise(points: np.ndarray, amount: float = 0.012) -> np.ndarray:
    return amount * hash_noise(points, 0.004, seed=11)


# ---------------------------------------------------------------- 상의 공통


def top_selection(hem_low: float, sleeve_length: float | None, margin: float = 0.04, neck_extra: float = 0.025) -> Callable[["BaseBody", np.ndarray, np.ndarray], np.ndarray]:
    def select(body: "BaseBody", points: np.ndarray, region: np.ndarray) -> np.ndarray:
        keep = points[:, 1] >= hem_low - margin
        axial, _ = arm_axial(body, points)
        arm = np.isin(region, [body.region_index(r) for r in ("upperArm.L", "upperArm.R", "forearm.L", "forearm.R")])
        if sleeve_length is None:
            keep &= ~arm | (axial <= 0.02)
        else:
            keep &= ~arm | (axial <= sleeve_length + margin)
        neck = region == body.region_index("neck")
        keep &= ~neck | (points[:, 1] <= body.landmarks.neck_back_y + neck_extra)
        return keep

    return select


def region_ids(body: "BaseBody", *names: str) -> list[int]:
    return [body.region_index(n) for n in names]


def keep_body_offset(ctx: ShapeContext, delta: np.ndarray) -> np.ndarray:
    """세로로 옮긴 정점이 원래 몸 표면 거리를 유지하게 법선 방향으로 고친 변위 — 기장 키가 좁은 발목 쪽 단을 굵은 종아리 높이로 올려도
    셸·밑단 띠·접힌 단의 겹(띠가 셸 바깥)이 그대로 남는다(몸 최소 거리만 지키면 띠가 셸 속으로 묻힌다)."""
    d0, _ = ctx.body.signed_distance(ctx.positions)
    moved = ctx.positions + delta
    d1, normal = ctx.body.signed_distance(moved)
    moving = np.linalg.norm(delta, axis=1) > 1e-6
    fix = np.where(moving, d0 - d1, 0.0)
    return delta + fix[:, None] * normal


def length_key(start_y: float, hem_y: float, amount_plus: float, amount_minus: float) -> ShapeKey:
    """밑단 기장: 시작 높이(위)에서 밑단까지 늘거나 준다(+ 길게, − 짧게). 옮긴 정점은 원래 몸 거리를 유지한다."""

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        y = ctx.positions[:, 1]
        w = smoothstep(start_y, hem_y, y)
        amount = amount_plus if sign > 0 else amount_minus
        out = np.zeros_like(ctx.positions)
        out[:, 1] = -sign * amount * w
        return keep_body_offset(ctx, out)

    return ShapeKey("length", delta, note_ko=f"기장 +{amount_plus * 100:.0f} cm / −{amount_minus * 100:.0f} cm")


def looseness_key(plus: float, minus: float, note: str = "") -> ShapeKey:
    """품: 몸에서 멀어지는 쪽으로 + 넉넉하게, − 슬림하게(최소 오프셋은 조립 때 지킨다)."""

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        amount = plus if sign > 0 else minus
        hits = ctx.body.surface.closest(ctx.positions)
        away = ctx.positions - hits.point
        away /= np.maximum(np.linalg.norm(away, axis=1, keepdims=True), 1e-9)
        return sign * amount * away

    return ShapeKey("looseness", delta, note_ko=note or f"품 +{plus * 1000:.0f} mm / −{minus * 1000:.0f} mm")


def sleeve_key(length: float, plus: float, minus: float, start: float = 0.03) -> ShapeKey:
    """소매 길이: 어깨에서 소매 끝으로 갈수록 팔 방향으로 늘거나 준다."""

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        axial, side = arm_axial(ctx.body, ctx.positions)
        w = smoothstep(start, length, axial) * (np.abs(ctx.positions[:, 0]) > 0.10)
        amount = plus if sign > 0 else minus
        out = np.zeros_like(ctx.positions)
        for s in (1.0, -1.0):
            frame = AxisFrame(ctx.body, "arm", s)
            sel = side == s
            out[sel] = np.outer(sign * amount * w[sel], frame.axis)
        return keep_body_offset(ctx, out)  # 손목 쪽 좁은 소매단이 굵은 위팔로 올라가도 커프스가 셸 바깥에 남게

    return ShapeKey("sleeve", delta, note_ko=f"소매 길이 +{plus * 100:.0f} cm / −{minus * 100:.0f} cm")


def neck_key(radius_band: float, plus: float, minus: float) -> ShapeKey:
    """목둘레 너비: 목둘레 가까운 정점을 목 축에서 멀어지게(+ 넓게) 또는 가깝게(− 좁게)."""

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        phi, rho = neck_polar(ctx.body, ctx.positions)
        w = (1.0 - smoothstep(radius_band, radius_band + 0.05, rho)) * (ctx.positions[:, 1] > ctx.body.landmarks.armpit_y - 0.02)
        direction = np.stack([np.sin(phi), np.zeros(len(phi)), np.cos(phi)], axis=1)
        amount = plus if sign > 0 else minus
        return direction * (sign * amount * w)[:, None]

    return ShapeKey("neck", delta, note_ko=f"목둘레 +{plus * 1000:.0f} mm / −{minus * 1000:.0f} mm")


# ---------------------------------------------------------------- 티셔츠


@dataclass
class BuildContext:
    """한 베이스의 의상 생성 문맥: 몸, 아래 레이어(겹쳐 입기), 설정."""

    body: "BaseBody"
    lower_torso: PolarEnvelope | None = None  # 하의(허리·엉덩이) 바깥 경계 — 상의 밑단이 그 바깥에
    inner_tops: list[Mesh] = field(default_factory=list)  # 레이어 1 상의 표면(본판·칼라) — 아우터가 그 바깥에
    bottoms: list[Mesh] = field(default_factory=list)  # 하의 표면(본판·허리띠) — 아우터 밑단이 그 바깥에
    gap: float = 0.005
    rig: "BodyRig | None" = None

    def get_rig(self) -> "BodyRig":
        if self.rig is None:
            self.rig = BodyRig(self.body, body_morph_names())
        return self.rig


def hem_zone_constraint(ctx: BuildContext, top_y: float) -> list[Callable[[np.ndarray], np.ndarray]]:
    """상의가 허리 아래(`top_y` 아래)에서 하의 바깥 경계 + 간격 밖에 있게 하는 제약."""
    out = []
    if ctx.lower_torso is not None:
        env = ctx.lower_torso

        def constraint(points: np.ndarray, env=env) -> np.ndarray:
            return env.push_out(points, ctx.gap, points[:, 1] < top_y)

        out.append(constraint)
    return out


def surface_push_constraint(mesh: Mesh, body: "BaseBody", gap: float, reach: float = 0.05, y_max: float | None = None) -> Callable[[np.ndarray], np.ndarray]:
    """점이 `mesh` 표면(몸 바깥쪽 법선) 바깥 `gap` 안에 있으면(최근접점이 `reach` 안일 때만) 법선 방향으로 민다 — 아래 레이어 의상 위에 얹기.
    `y_max`가 있으면 그보다 높으면서 목 축 가까이(수평 10.5 cm 안)인 점, 곧 나중에 잘려 나갈 목 관만 건드리지 않는다
    (아래 레이어 칼라에 밀려 목둘레 절단이 깨지지 않게 — 어깨 윗면은 그 높이여도 민다)."""
    surface = Surface(mesh.positions, mesh.triangles)
    normals = outward(welded_normals(mesh), mesh.positions, body)

    def constraint(points: np.ndarray) -> np.ndarray:
        hits = surface.closest(points)
        corners = surface.triangles[np.maximum(hits.triangle, 0)]
        n = np.einsum("mc,mck->mk", hits.bary, normals[corners])
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        rel = points - hits.point
        d = np.einsum("ij,ij->i", rel, n)
        near = np.linalg.norm(rel, axis=1) < reach
        if y_max is not None:
            _, rho = neck_polar(body, points)
            near &= ~((points[:, 1] >= y_max) & (rho < 0.105))
        need = np.where(near, np.maximum(gap - d, 0.0), 0.0)
        return points + need[:, None] * n

    return constraint


def outer_constraints(ctx: BuildContext, y_max: float | None = None) -> list[Callable[[np.ndarray], np.ndarray]]:
    """아우터가 레이어 1 상의들(각각)과 하의들 표면 바깥 간격 이상에 있게 하는 제약(`y_max` 위는 그대로)."""
    return [surface_push_constraint(m, ctx.body, ctx.gap, y_max=y_max) for m in ctx.inner_tops + ctx.bottoms]


def top_seam_fields(body: "BaseBody", points: np.ndarray, armhole: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """상의 판 경계 장: (앞뒤 = z − 몸통 앞뒤 중심(옆선·어깨선·소매 위아래), 진동둘레 = 팔 방향 거리 − `armhole`(몸통 쪽은 음수))."""
    front_back = points[:, 2] - body.side_seam_z(points[:, 1])
    axial, _ = arm_axial(body, points)
    armhole_field = axial - armhole
    armhole_field[np.abs(points[:, 0]) < 0.10] = -1.0
    return front_back, armhole_field


def panel_labels_from_fields(body: "BaseBody", mesh: Mesh) -> np.ndarray:
    """`split_panels`가 남긴 장 부호로 판 라벨: 몸판 앞 0·뒤 1, 왼소매 앞 2·뒤 3, 오른소매 앞 4·뒤 5."""
    front = mesh.attrs["s0"] >= 0.0
    sleeve = mesh.attrs["s1"] > 0.0
    left = mesh.positions[:, 0] >= 0.0
    label = np.where(front, 0, 1)
    label = np.where(sleeve & left, np.where(front, 2, 3), label)
    label = np.where(sleeve & ~left, np.where(front, 4, 5), label)
    return label.astype(np.int64)


def top_seam_paint(body: "BaseBody", points: np.ndarray, base: float, armhole: float = 0.0, side_seam: bool = True, shoulder_seam: bool = True, underarm: bool = True, darkness: float = 0.16) -> np.ndarray:
    """상의 본판 솔기 무늬: 옆선·어깨선(앞뒤 장 0), 진동둘레(팔 방향 장 0), 소매 밑선. 솔기는 가는 어두운 선 + 4 mm 옆 점선 스티치."""
    fb, arm = top_seam_fields(body, points, armhole)
    axial, _ = arm_axial(body, points)
    on_sleeve = arm > 0.0
    on_torso = ~on_sleeve
    upper = points[:, 1] > body.landmarks.armpit_y + 0.015
    seam = np.zeros(len(points))
    stitch = np.zeros(len(points))
    if side_seam:
        sel = on_torso & ~upper
        seam = np.maximum(seam, line_profile(fb, 0.0, 0.0006) * sel)
    if shoulder_seam:
        sel = on_torso & upper
        seam = np.maximum(seam, line_profile(fb, 0.0, 0.0006) * sel)
    if underarm:
        below = np.zeros(len(points), dtype=bool)
        for sign in (1.0, -1.0):
            frame = AxisFrame(body, "arm", sign)
            sel = on_sleeve & (np.sign(points[:, 0]) == sign)
            below[sel] = (points[sel] - frame.origin) @ frame.e1 < 0.0
        seam = np.maximum(seam, line_profile(fb, 0.0, 0.0006) * below)
    near_arm = np.abs(points[:, 0]) > 0.10
    seam = np.maximum(seam, line_profile(arm, 0.0, 0.0006) * near_arm)
    stitch = np.maximum(stitch, line_profile(arm, -0.004, 0.00045) * near_arm * dash_profile(points[:, 1] + points[:, 2], 0.0035))
    return base + knit_noise(points) - darkness * seam - 0.7 * darkness * stitch


def rib_paint(body: "BaseBody", points: np.ndarray, base: float = 0.93, depth: float = 0.07, period: float = 0.0032) -> np.ndarray:
    """립 짜임: 띠 둘레 방향으로 반복되는 가는 줄(목둘레는 목 축, 소매는 팔 축, 밑단은 몸통 축 각도로 위상)."""
    torso_frame = AxisFrame(body, "torso")
    _, r, theta, _ = torso_frame.cyl(points)
    axial, side = arm_axial(body, points)
    phi, rho = neck_polar(body, points)
    on_sleeve = (np.abs(points[:, 0]) > 0.12) & (axial > 0.03)
    on_neck = (points[:, 1] > body.landmarks.armpit_y - 0.06) & ~on_sleeve
    coord = r * theta
    coord = np.where(on_neck, rho * phi, coord)
    for sign in (1.0, -1.0):
        frame = AxisFrame(body, "arm", sign)
        sel = on_sleeve & (side == sign)
        if sel.any():
            _, rr, th, _ = frame.cyl(points[sel])
            coord[sel] = rr * th
    rib = 0.5 + 0.5 * np.cos(2.0 * np.pi * coord / period)
    return base - depth * rib + knit_noise(points, 0.006)


def finish_band_edges(bands: Mesh, body: "BaseBody", thickness: float = 0.0028, depth: float = 0.010) -> Mesh:
    """띠 조각의 바깥 가장자리(장 값 0 쪽 고리)마다 안쪽으로 접힌 단을 붙인다."""
    normals = outward(welded_normals(bands), bands.positions, body)
    for loop in boundary_loops(bands.triangles):
        if np.all(bands.attrs["_v"][loop] > 0.01):
            continue  # 본판 쪽(라이저 아래) 고리
        bands = add_fold(bands, loop, normals, band_grad(bands, loop), thickness, depth)
        normals = outward(welded_normals(bands), bands.positions, body)
    return bands


def upper_hull_y(xs: np.ndarray, ys: np.ndarray, query: np.ndarray) -> np.ndarray:
    """점들 (x, y)의 위쪽 볼록 껍질을 x에서 보간한 y."""
    order = np.argsort(xs)
    pts = np.stack([xs[order], ys[order]], axis=1)
    hull: list[np.ndarray] = []
    for p in pts:
        while len(hull) >= 2 and ((hull[-1][0] - hull[-2][0]) * (p[1] - hull[-2][1]) - (hull[-1][1] - hull[-2][1]) * (p[0] - hull[-2][0])) >= 0:
            hull.pop()
        hull.append(p)
    hull_arr = np.array(hull)
    return np.interp(query, hull_arr[:, 0], hull_arr[:, 1])


def shoulder_line_fill(x_from: float = 0.100, x_to: float = 0.30, slice_z: float = 0.012, sag: float = 0.003) -> Callable[["BaseBody", np.ndarray, np.ndarray], np.ndarray]:
    """어깨 윗선(목 옆 ~ 소매 위)의 오목한 곳(승모근 골)을 z 단면마다 위쪽 볼록 껍질까지 채운다 — 천이 어깨를 팽팽히 덮은 곧은 어깨선."""

    def shape(body: "BaseBody", points: np.ndarray, region: np.ndarray) -> np.ndarray:
        out = points.copy()
        arm_y = float(body.joint("LeftArm")[1])
        ax = np.abs(points[:, 0])
        top = (points[:, 1] > arm_y + 0.005) & (ax >= x_from) & (ax <= x_to)
        if not top.any():
            return out
        z = points[:, 2]
        for z0 in np.arange(z[top].min(), z[top].max() + slice_z, slice_z):
            sel = top & (np.abs(z - z0) <= 0.75 * slice_z)
            if sel.sum() < 6:
                continue
            hull = upper_hull_y(ax[sel], points[sel, 1], ax[sel])
            out[sel, 1] = np.maximum(points[sel, 1], hull - sag)
        return out

    return shape


def armpit_pin(radius: float = 0.05) -> Callable[["BaseBody", np.ndarray], np.ndarray]:
    """겨드랑이 꼭지점 `radius` 안의 정점은 평활에서 고정한다(몸 오프셋 그대로 → 팔과 몸통 사이 물갈퀴가 생기지 않는다)."""

    def pin(body: "BaseBody", points: np.ndarray) -> np.ndarray:
        mask = np.zeros(len(points), dtype=bool)
        for apex in body.armpit_points().values():
            mask |= np.linalg.norm(points - apex, axis=1) < radius
        return mask

    return pin


def top_d_hi(body: "BaseBody", p: np.ndarray, region: np.ndarray, e: np.ndarray, loose: float = 0.06, tight: float = 0.006) -> np.ndarray:
    """상의 최대 거리: 겨드랑이 근처·어깨·소매는 몸에 붙이고(겨드랑이 물갈퀴 방지), 가슴 아래·허리 뒤는 드레이프가 채우도록 풀어 준다."""
    lm = body.landmarks
    torso = np.isin(region, region_ids(body, "torso", "pelvis"))
    release = smoothstep(lm.armpit_y - 0.05, lm.armpit_y - 0.13, p[:, 1])
    side = np.abs(p[:, 0]) / np.maximum(np.abs(p[:, 0]).max(), 1e-6)
    near_side = smoothstep(0.55, 0.85, side) * (1.0 - smoothstep(lm.armpit_y - 0.16, lm.armpit_y - 0.24, p[:, 1]))
    allowance = tight + (loose - tight) * release * (1.0 - near_side)
    return np.where(torso, e + allowance, e + tight)


def build_tee(ctx: BuildContext) -> GarmentPlan:
    """반소매 티셔츠: 크루넥 립(트림), 소매단·밑단 띠(트림), 어깨·옆·진동·소매 밑 솔기, 접힌 단. 형태 키: 기장·품·소매·목둘레."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    hem_y = lm.hip_y + (0.040 if female else 0.050)
    sleeve_len = 0.150 if female else 0.160
    e_torso = 0.018 if female else 0.020

    def ease(b: "BaseBody", p: np.ndarray, region: np.ndarray) -> np.ndarray:
        axial, _ = arm_axial(b, p)
        arm = np.isin(region, region_ids(b, "upperArm.L", "upperArm.R"))
        e = np.full(len(p), e_torso)
        e[arm] = 0.009 + 0.007 * smoothstep(0.04, sleeve_len, axial[arm])
        e[region == b.region_index("neck")] = 0.006
        top = (p[:, 1] > lm.armpit_y + 0.02) & (np.abs(p[:, 0]) > 0.07) & (np.abs(p[:, 0]) < 0.20)
        e[top] = np.minimum(e[top], 0.008)
        return e

    def d_lo(b: "BaseBody", p: np.ndarray, region: np.ndarray, e: np.ndarray) -> np.ndarray:
        lo = np.maximum(0.62 * e, 0.0072)
        zone = smoothstep(lm.waist_y - 0.04, lm.waist_y - 0.10, p[:, 1])
        torso = np.isin(region, region_ids(b, "torso", "pelvis"))
        return np.where(torso, np.maximum(lo, 0.026 * zone), lo)

    def d_hi(b: "BaseBody", p: np.ndarray, region: np.ndarray, e: np.ndarray) -> np.ndarray:
        return top_d_hi(b, p, region, e)

    plan = ShellPlan(
        regions=("torso", "pelvis", "neck", "upperArm.L", "upperArm.R"),
        ease=ease,
        d_lo=d_lo,
        d_hi=d_hi,
        select=top_selection(hem_y, sleeve_len),
        iterations=30,
        drape={"kind": "torso", "down": 0.55 if female else 0.32, "side": 1.6, "top": lm.armpit_y - 0.02, "regions": ("torso", "pelvis")},
        target_triangles=7600,
        pin=armpit_pin(0.055),
        shape=shoulder_line_fill(),
    )
    shell = build_body_shell(body, plan, hem_zone_constraint(ctx, lm.waist_y - 0.02))
    band_w = 0.022
    shell, _ = cut_edge(shell, "hem", shell.positions[:, 1] - hem_y, (band_w,))
    shell, _ = cut_edge(shell, "sleeve", sleeve_field(body, shell.positions, sleeve_len), (0.019,))
    # 크루넥: 고정 반지름 원기둥 대신 목 관 윗단에서의 표면 거리(베이스마다 목 굵기가 달라도 한 고리로 깨끗이 잘린다)
    shell, neck_values = geodesic_neck_field(body, shell, NeckSpec(front=0.036, side=0.010, back=0.014))
    shell, _ = cut_edge(shell, "neck", neck_values, (0.016,))
    fb, arm = top_seam_fields(body, shell.positions)
    shell = split_panels(shell, [fb, arm])
    shell.attrs["panel"] = panel_labels_from_fields(body, shell)
    normals = outward(welded_normals(shell), shell.positions, body)
    edge_value = np.minimum.reduce([shell.attrs["f_hem"] / band_w, shell.attrs["f_sleeve"] / 0.019, shell.attrs["f_neck"] / 0.016])
    main, bands = band_split(shell, edge_value, 1.0, 0.0016, normals)
    bands = finish_band_edges(bands, body)

    def main_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        return top_seam_paint(body, points, 0.955)

    def band_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        return rib_paint(body, points)

    pieces = [
        Piece("body", main, role="main", attach="body", uv="unwrap", paint=main_paint, value=0.95, smooth_group="shell", normal_smooth=10),
        Piece("bands", bands, role="trim", attach="carrier", uv="unwrap", paint=band_paint, value=0.92, compat_value=0.86),
    ]
    keys = [
        length_key(lm.waist_y + 0.02, hem_y, 0.07, 0.065),
        looseness_key(0.010, 0.006),
        sleeve_key(sleeve_len, 0.10, 0.06),
        neck_key(0.11, 0.018, 0.010),
    ]
    return GarmentPlan("top", "tee", 1, pieces, keys, hem_zone_constraint(ctx, lm.waist_y - 0.02), {"hemY": hem_y, "sleeveLength": sleeve_len})


# ---------------------------------------------------------------- 몸을 따라 미끄러지는 변형(형태 키 보조)


class BodyProfile:
    """몸통·골반 단면 반지름표(몸통 축, 높이 × 각도): 형태 키가 몸 표면을 따라 위아래로 미끄러질 때 쓴다."""

    def __init__(self, body: "BaseBody") -> None:
        self.frame = AxisFrame(body, "torso")
        torso = body.region_mask(["torso", "pelvis", "thigh.L", "thigh.R"])
        lm = body.landmarks
        self.env = PolarEnvelope(self.frame, body.P[torso], (lm.crotch_y - 0.08, lm.armpit_y), dt=0.006, n_theta=96, grow=0)

    def slide(self, points: np.ndarray, dy: np.ndarray) -> np.ndarray:
        """점을 높이 `dy`만큼 옮기되 몸 반지름 변화만큼 반지름도 바꾼다(몸에서 뜬 거리를 유지)."""
        t, r, theta, direction = self.frame.cyl(points)
        before = self.env.lookup(t, theta)
        after = self.env.lookup(t + dy, theta)
        ok = np.isfinite(before) & np.isfinite(after)
        dr = np.zeros(len(points))
        dr[ok] = after[ok] - before[ok]
        out = points.copy()
        out[:, 1] += dy
        # 새 높이에서 다시 방향을 잰다(몸통 축 z가 높이마다 다르다)
        _, r2, _, direction2 = self.frame.cyl(out)
        out += direction2 * dr[:, None]
        return out


# ---------------------------------------------------------------- 바지 공통


def pants_panels(body: "BaseBody", points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """바지 판 경계 장: (좌우 = x(앞뒤 중심 솔기), 앞뒤 = z − 다리/몸통 앞뒤 중심(안솔기·바깥솔기))."""
    lm = body.landmarks
    z_leg = np.zeros(len(points))
    for sign in (1.0, -1.0):
        frame = AxisFrame(body, "leg", sign)
        sel = np.where(points[:, 0] >= 0, 1.0, -1.0) == sign
        t = (points[sel] - frame.origin) @ frame.axis
        z_leg[sel] = (frame.origin + np.outer(t, frame.axis))[:, 2]
    z_torso = body.side_seam_z(points[:, 1])
    blend = smoothstep(lm.crotch_y - 0.02, lm.hip_y + 0.02, points[:, 1])
    zc = (1.0 - blend) * z_leg + blend * z_torso
    return points[:, 0].copy(), points[:, 2] - zc


def pants_labels(mesh: Mesh) -> np.ndarray:
    left = mesh.attrs["s0"] >= 0.0
    front = mesh.attrs["s1"] >= 0.0
    return (left.astype(np.int64) * 2 + front.astype(np.int64)).astype(np.int64)


UNDERWEAR_COVER_M = 0.016  # 하의 허리선이 속옷 윗선보다 최소 이만큼 위


def waist_line(body: "BaseBody", theta: np.ndarray, front_y: float, back_y: float) -> np.ndarray:
    """허리선 높이(앞 `front_y`, 뒤 `back_y`, 옆은 중간) — 단, 속옷 윗선 + 1.6 cm보다 낮지 않다."""
    line = front_back_blend(theta, front_y, 0.5 * (front_y + back_y), back_y, power=1.0)
    return np.maximum(line, body.underwear_top(theta) + UNDERWEAR_COVER_M)


def effective_waist(body: "BaseBody", front_y: float, back_y: float) -> tuple[float, float]:
    """앞·뒤 허리 높이를 속옷 윗선 + 덮개 여유 이상으로 올린 값."""
    front = max(front_y, float(body.underwear_top(np.array([0.0]))[0]) + UNDERWEAR_COVER_M)
    back = max(back_y, float(body.underwear_top(np.array([np.pi]))[0]) + UNDERWEAR_COVER_M)
    return front, back


def waist_field(body: "BaseBody", points: np.ndarray, front_y: float, back_y: float) -> np.ndarray:
    """허리선 아래가 양수인 장."""
    frame = AxisFrame(body, "torso")
    _, _, theta, _ = frame.cyl(points)
    return waist_line(body, theta, front_y, back_y) - points[:, 1]


def midplane_constraint(body: "BaseBody", gap: float = 0.005) -> Callable[[np.ndarray], np.ndarray]:
    """다리 셸이 몸 가운데 면(x = 0)을 넘어 반대쪽 다리 셸과 겹치지 않게 한다(가랑이 아래만)."""
    crotch = body.landmarks.crotch_y

    def constraint(points: np.ndarray) -> np.ndarray:
        out = points.copy()
        below = points[:, 1] < crotch - 0.01
        side = np.where(points[:, 0] >= 0.0, 1.0, -1.0)
        need = below & (np.abs(points[:, 0]) < gap)
        out[need, 0] = side[need] * gap
        return out

    return constraint


def denim_paint(base: float = 0.86, twill: float = 0.045, fade: float = 0.06) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
    """데님: 월드 UV 대각선 능직 + 허벅지 앞·무릎 물빠짐(밝게) + 결 노이즈."""

    def paint(points: np.ndarray, uvw: np.ndarray) -> np.ndarray:
        diag = 0.5 + 0.5 * np.cos(2.0 * np.pi * (uvw[:, 0] + uvw[:, 1]) / 0.0026)
        streak = hash_noise(np.stack([points[:, 0] * 6.0, points[:, 1] * 0.6, points[:, 2] * 6.0], axis=1), 0.02, seed=19)
        front = np.clip(points[:, 2] / 0.12, 0.0, 1.0)
        knee = np.exp(-((points[:, 1] - 0.47) / 0.07) ** 2)
        thigh = np.exp(-((points[:, 1] - 0.66) / 0.08) ** 2)
        return base - twill * diag + 0.018 * streak + fade * front * (0.8 * thigh + 0.6 * knee)

    return paint


def wool_paint(base: float = 0.92, grain: float = 0.012) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
    def paint(points: np.ndarray, uvw: np.ndarray) -> np.ndarray:
        return base + grain * hash_noise(points, 0.0025, seed=23) + 0.6 * grain * hash_noise(points, 0.012, seed=29)

    return paint


def stitch_line(values: np.ndarray, level: float, along: np.ndarray, width: float = 0.00045, period: float = 0.0034) -> np.ndarray:
    return line_profile(values, level, width) * dash_profile(along, period)


@dataclass
class PantsSpec:
    name: str
    hem_y: float  # 다리 밑단 높이(m)
    waist_front: float
    waist_back: float
    ease_hip: float
    ease_thigh: float
    ease_knee: float
    ease_hem: float
    drape_down: float
    band_width: float = 0.036
    cuff: float = 0.0  # 접어 올린 밑단 띠 폭(0이면 단순 접힌 단)
    cuff_lift: float = 0.0030
    loops: int = 7
    paint: Callable[[np.ndarray, np.ndarray], np.ndarray] | None = None
    crease: float = 0.0  # 앞·뒤 주름선 높이(m, 슬랙스)
    target_triangles: int = 7600


def build_pants(ctx: BuildContext, spec: PantsSpec) -> tuple[Mesh, Mesh, Mesh | None, dict[str, Any]]:
    """바지 셸(본판·허리띠·밑단 띠)을 만든다. (본판, 허리띠, 밑단 띠 또는 None, 정보)."""
    body = ctx.body
    lm = body.landmarks
    top_y = max(spec.waist_front, spec.waist_back)

    def ease(b: "BaseBody", p: np.ndarray, region: np.ndarray) -> np.ndarray:
        y = p[:, 1]
        t_thigh = smoothstep(lm.crotch_y, lm.knee_y, y)  # 가랑이 0 → 무릎 1
        t_calf = smoothstep(lm.knee_y, spec.hem_y, y)  # 무릎 0 → 밑단 1
        leg = spec.ease_thigh + (spec.ease_knee - spec.ease_thigh) * t_thigh
        leg = np.where(y < lm.knee_y, spec.ease_knee + (spec.ease_hem - spec.ease_knee) * t_calf, leg)
        e = np.where(y > lm.crotch_y, spec.ease_hip, leg)
        return np.where(y > lm.hip_y + 0.03, np.minimum(e, 0.009), e)

    def d_lo(b: "BaseBody", p: np.ndarray, region: np.ndarray, e: np.ndarray) -> np.ndarray:
        return np.maximum(0.6 * e, 0.0065)

    def d_hi(b: "BaseBody", p: np.ndarray, region: np.ndarray, e: np.ndarray) -> np.ndarray:
        y = p[:, 1]
        loose = smoothstep(lm.knee_y + 0.10, lm.knee_y - 0.05, y) * 0.05
        return e + 0.006 + loose

    def select(b: "BaseBody", p: np.ndarray, region: np.ndarray) -> np.ndarray:
        return (p[:, 1] >= spec.hem_y - 0.04) & (p[:, 1] <= top_y + 0.05)

    plan = ShellPlan(
        regions=("torso", "pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"),
        ease=ease,
        d_lo=d_lo,
        d_hi=d_hi,
        select=select,
        iterations=30,
        drape={"kind": "legs", "down": spec.drape_down, "side": 1.5, "top": lm.crotch_y + 0.06, "regions": ("pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R")},
        target_triangles=spec.target_triangles,
    )
    shell = build_body_shell(body, plan, [midplane_constraint(body)])
    if spec.crease > 0.0:
        shell.positions = add_creases(body, shell.positions, spec.crease)
    shell, _ = cut_edge(shell, "waist", waist_field(body, shell.positions, spec.waist_front, spec.waist_back), (spec.band_width,))
    hem_bands = (spec.cuff,) if spec.cuff > 0 else ()
    shell, _ = cut_edge(shell, "hem", shell.positions[:, 1] - spec.hem_y, hem_bands)
    lr, fb = pants_panels(body, shell.positions)
    shell = split_panels(shell, [lr, fb])
    shell.attrs["panel"] = pants_labels(shell)
    normals = outward(welded_normals(shell), shell.positions, body)
    main, band = band_split(shell, shell.attrs["f_waist"] / spec.band_width, 1.0, 0.0020, normals)
    band = finish_band_edges(band, body, 0.0030, 0.010)
    cuff = None
    normals = outward(welded_normals(main), main.positions, body)
    if spec.cuff > 0.0:
        main, cuff = band_split(main, main.attrs["f_hem"] / spec.cuff, 1.0, spec.cuff_lift, normals)
        cuff = finish_band_edges(cuff, body, 0.0035, 0.012)
    else:
        for loop in boundary_loops(main.triangles):
            if np.all(main.attrs["f_hem"][loop] < 2e-4):
                main = add_fold(main, loop, normals, band_grad(main, loop), 0.0030, 0.012)
                normals = outward(welded_normals(main), main.positions, body)
    info = {"bandTop": top_y, "hemY": spec.hem_y}
    return main, band, cuff, info


def add_creases(body: "BaseBody", points: np.ndarray, height: float) -> np.ndarray:
    """슬랙스 다리 앞·뒤 가운데 세로 주름선: 다리 축 둘레 각도 0(앞)·π(뒤) 근처를 바깥으로 밀어 능선을 세운다(가랑이 아래, 허리 쪽으로 갈수록 약하게)."""
    out = points.copy()
    lm = body.landmarks
    for sign in (1.0, -1.0):
        frame = AxisFrame(body, "leg", sign)
        sel = (np.sign(points[:, 0]) == sign) & (points[:, 1] < lm.crotch_y + 0.04)
        t, r, theta, direction = frame.cyl(points[sel])
        ridge = np.zeros(int(sel.sum()))
        for center in (0.0, np.pi):
            d = np.abs((theta - center + np.pi) % (2 * np.pi) - np.pi)
            ridge = np.maximum(ridge, np.clip(1.0 - d / 0.55, 0.0, 1.0) ** 1.6)
        fade = smoothstep(lm.crotch_y + 0.04, lm.crotch_y - 0.06, points[sel, 1])
        out[sel] += direction * (height * ridge * fade)[:, None]
    return out


def belt_loops(carrier: Mesh, body: "BaseBody", angles: list[float], y_bottom: float, y_top: float, width: float = 0.010, lift: float = 0.0026) -> Mesh:
    """허리띠 위 세로 벨트 고리들(납작한 띠, 위아래 끝은 허리띠 속으로 묻힌다)."""
    surface, normals_c = surface_frame_normals(carrier)
    frame = AxisFrame(body, "torso")
    pieces = []
    for phi in angles:
        ys = np.linspace(y_bottom, y_top, 9)
        cz = body.torso_center_z(ys)
        direction = np.stack([np.sin(phi) * np.ones(len(ys)), np.zeros(len(ys)), np.cos(phi) * np.ones(len(ys))], axis=1)
        origins = np.stack([np.zeros(len(ys)), ys, cz], axis=1) + direction * 0.5
        hits, tri = surface.ray(origins, -direction, 0.6)
        if (tri < 0).any():
            continue
        corners = surface.triangles[tri]
        bary = np.clip(barycentric(hits, surface.positions[corners[:, 0]], surface.positions[corners[:, 1]], surface.positions[corners[:, 2]]), 0, 1)
        bary /= bary.sum(axis=1, keepdims=True)
        n = np.einsum("mc,mck->mk", bary, normals_c[corners])
        n /= np.linalg.norm(n, axis=1, keepdims=True)
        n = np.where((n * direction).sum(axis=1)[:, None] < 0, -n, n)
        # 가운데는 띠에서 떠 있고(고리) 위아래 끝은 붙는다
        lift_profile = lift * np.sin(np.linspace(0.0, np.pi, len(ys))) ** 0.35
        curve = hits + n * lift_profile[:, None]
        pieces.append(ribbon(curve, n, width, 0.0018, base=0.0, sink=0.0015))
    del frame
    return merge_meshes(pieces) if pieces else Mesh(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64))


def surface_point(carrier_surface: Surface, carrier_normals: np.ndarray, origin: np.ndarray, direction: np.ndarray) -> tuple[np.ndarray, np.ndarray] | None:
    hits, tri = carrier_surface.ray(origin[None, :], direction[None, :], 1.2)
    if tri[0] < 0:
        return None
    corners = carrier_surface.triangles[tri]
    bary = np.clip(barycentric(hits, carrier_surface.positions[corners[:, 0]], carrier_surface.positions[corners[:, 1]], carrier_surface.positions[corners[:, 2]]), 0, 1)
    bary /= bary.sum(axis=1, keepdims=True)
    n = np.einsum("mc,mck->mk", bary, carrier_normals[corners])[0]
    n /= np.linalg.norm(n)
    if n @ direction > 0:
        n = -n
    return hits[0], n


# ---------------------------------------------------------------- 바지 형태 키


def pants_length_key(body: "BaseBody", hem_y: float, plus: float, minus: float, start: float | None = None) -> ShapeKey:
    """바지 기장: `start` 높이(위, 기본 무릎 위 3 cm 또는 밑단 위 25 cm 중 낮은 곳)에서 밑단으로 갈수록 내려가거나(+) 올라간다(−)."""
    lm = body.landmarks
    begin = min(lm.knee_y + 0.03, hem_y + 0.25) if start is None else start
    if begin <= hem_y:
        begin = hem_y + 0.18  # 무릎 위에서 끝나는 반바지: 밑단 위 18 cm부터

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        y = ctx.positions[:, 1]
        w = smoothstep(begin, hem_y, y)
        out = np.zeros_like(ctx.positions)
        out[:, 1] = -sign * (plus if sign > 0 else minus) * w
        return keep_body_offset(ctx, out)

    return ShapeKey("length", delta, note_ko=f"기장 +{plus * 100:.0f} cm / −{minus * 100:.0f} cm")


def flare_key(body: "BaseBody", hem_y: float, plus: float, minus: float, start: float | None = None) -> ShapeKey:
    """밑단 퍼짐(+ 부츠컷 / − 스키니): 무릎 아래를 다리 축에서 바깥으로."""
    lm = body.landmarks
    begin = lm.knee_y + 0.04 if start is None else start

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        out = np.zeros_like(ctx.positions)
        w = smoothstep(begin, hem_y, ctx.positions[:, 1])
        for s_ in (1.0, -1.0):
            frame = AxisFrame(ctx.body, "leg", s_)
            sel = (np.sign(ctx.positions[:, 0]) == s_) & (w > 0)
            _, _, _, direction = frame.cyl(ctx.positions[sel])
            out[sel] = direction * (sign * (plus if sign > 0 else minus) * w[sel])[:, None]
        return out

    return ShapeKey("flare", delta, note_ko=f"밑단 퍼짐 +{plus * 1000:.0f} mm / −{minus * 1000:.0f} mm")


def rise_key(body: "BaseBody", low: float, top: float, plus: float, minus: float) -> ShapeKey:
    """밑위(허리 높이): 엉덩이 위 부분을 몸 표면을 따라 위(+)·아래(−)로 미끄러뜨린다."""
    profile = BodyProfile(body)

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        w = smoothstep(low, top, ctx.positions[:, 1])
        dy = sign * (plus if sign > 0 else minus) * w
        return profile.slide(ctx.positions, dy) - ctx.positions

    return ShapeKey("rise", delta, note_ko=f"밑위 +{plus * 100:.1f} cm / −{minus * 100:.1f} cm")


# ---------------------------------------------------------------- 청바지


def fly_piece(surface: Surface, normals_c: np.ndarray, top_y: float, crotch_y: float, paint: Callable[[np.ndarray, np.ndarray], np.ndarray] | None, value: float, double: bool = False) -> Piece:
    """앞 지퍼 덮개(캐릭터 왼쪽, J 모양 패치 + J 스티치, `double`이면 두 줄)."""
    fly_bottom = crotch_y + 0.035
    poly = [[-0.004, top_y], [0.036, top_y], [0.036, fly_bottom + 0.035]]
    for a in np.linspace(0.0, np.pi / 2, 7)[1:]:
        poly.append([0.036 - 0.040 * (1 - math.cos(a)), fly_bottom + 0.035 - 0.035 * math.sin(a)])
    poly.append([-0.004, fly_bottom])
    fly_poly = np.array(poly)
    fly = surface_patch(surface, normals_c, FRONT, fly_poly, 0.0004, 0.0010, bevel=0.002, grid=0.006)

    def fly_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        d = polygon_distance(uvw, fly_poly)
        inside = point_in_polygon(uvw, fly_poly)
        base = paint(points, uvw) if paint else np.full(len(points), value)
        along = uvw[:, 0] + uvw[:, 1]
        st = stitch_line(np.where(inside, d, -d), 0.0065, along)
        if double:
            st = st + stitch_line(np.where(inside, d, -d), 0.0105, along) * (uvw[:, 0] > 0.02)
        return base + 0.13 * np.clip(st, 0, 1) - 0.10 * line_profile(np.where(inside, d, -d), 0.0, 0.0006)

    return Piece("fly", fly, role="main", attach="carrier", uv="grid", paint=fly_paint, value=value)


def torso_surface_curve(body: "BaseBody", surface: Surface, normals_c: np.ndarray, phis: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """몸통 축 각도 φ·높이 y마다 바깥에서 축으로 쏜 광선이 닿는 표면점 열(주머니 입구선 같은 표면 곡선)."""
    pts = []
    for phi, yy in zip(phis, ys):
        cz = float(body.torso_center_z(np.array([yy]))[0])
        hit = surface_point(surface, normals_c, np.array([math.sin(phi) * 0.6, yy, cz + math.cos(phi) * 0.6]), -np.array([math.sin(phi), 0.0, math.cos(phi)]))
        if hit is not None:
            pts.append(hit[0])
    return np.array(pts).reshape(-1, 3)


def welt_pockets(surface: Surface, normals_c: np.ndarray, y_center: float, x_center: float, width: float, height: float = 0.010) -> list[tuple[np.ndarray, Mesh]]:
    """뒤 입술 주머니 두 개(후면에서 본 직사각형 패치 — 입구 입술이 1.6 mm 솟는다). [(후면 틀 다각형, 패치)]."""
    out = []
    for sign in (1.0, -1.0):
        cx = sign * x_center
        poly = np.array([[cx - width / 2, y_center - height / 2], [cx + width / 2, y_center - height / 2], [cx + width / 2, y_center + height / 2], [cx - width / 2, y_center + height / 2]])
        poly_back = (poly * np.array([-1.0, 1.0]))[::-1]
        patch = surface_patch(surface, normals_c, BACK, poly_back, 0.0003, 0.0016, bevel=0.0018, grid=0.004)
        out.append((poly_back, patch))
    return out


def jeans_spec(body: "BaseBody") -> PantsSpec:
    lm = body.landmarks
    female = body.base_id == "female"
    front, back = effective_waist(body, lm.hip_y + (0.105 if female else 0.110), lm.hip_y + (0.135 if female else 0.140))
    return PantsSpec(
        name="jeans",
        hem_y=lm.ankle_y + 0.045,
        waist_front=front,
        waist_back=back,
        ease_hip=0.0095,
        ease_thigh=0.0105,
        ease_knee=0.0125,
        ease_hem=0.0150,
        drape_down=0.22,
        band_width=0.036,
        cuff=0.038,
        cuff_lift=0.0032,
        paint=denim_paint(),
    )


def waist_line_y(spec: PantsSpec, phi: np.ndarray, body: "BaseBody | None" = None) -> np.ndarray:
    if body is None:
        return front_back_blend(phi, spec.waist_front, 0.5 * (spec.waist_front + spec.waist_back), spec.waist_back, power=1.0)
    return waist_line(body, phi, spec.waist_front, spec.waist_back)


def build_jeans(ctx: BuildContext) -> GarmentPlan:
    """청바지: 허리띠(트림)·벨트 고리 7·버튼·리벳·지퍼 덮개(J 스티치)·앞 주머니 곡선·동전 주머니·뒤 요크·패치 주머니 2·접어 올린 밑단(트림)."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    spec = jeans_spec(body)
    main, band, cuff, info = build_pants(ctx, spec)
    surface, normals_c = surface_frame_normals(main)
    band_surface, band_normals = surface_frame_normals(band)
    paint = spec.paint
    lr, fb = (main.attrs["s0"], main.attrs["s1"])
    del lr, fb
    band_bottom_front = spec.waist_front - spec.band_width
    band_bottom_back = spec.waist_back - spec.band_width
    pocket_x = 0.072 if female else 0.068

    # -- 뒤 패치 주머니(오각형)
    details: list[Piece] = []
    back_pockets = []
    for sign in (1.0, -1.0):
        cx = sign * pocket_x
        top = band_bottom_back - 0.028
        w, h = 0.128 if female else 0.134, 0.142
        poly = np.array([[cx - w / 2, top], [cx + w / 2, top], [cx + w / 2 * 0.94, top - h * 0.80], [cx, top - h], [cx - w / 2 * 0.94, top - h * 0.80]])
        # 뒤에서 본 틀은 x가 뒤집힌다(BACK.ex = −x)
        poly_back = poly * np.array([-1.0, 1.0])
        patch = surface_patch(surface, normals_c, BACK, poly_back[::-1], 0.0008, 0.0024, bevel=0.0025, grid=0.007)
        back_pockets.append((poly_back[::-1], patch))

    def pocket_paint(polygon: np.ndarray) -> Callable[[np.ndarray, np.ndarray, str], np.ndarray]:
        def paint_fn(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
            d = polygon_distance(uvw, polygon)
            inside = point_in_polygon(uvw, polygon)
            base = paint(points, uvw) if paint else np.full(len(points), 0.86)
            along = uvw[:, 0] + uvw[:, 1]
            stitches = stitch_line(np.where(inside, d, -d), 0.0035, along) + stitch_line(np.where(inside, d, -d), 0.0075, along)
            # 장식 곡선 스티치(갈매기 모양 두 줄)
            cx = polygon[:, 0].mean()
            top = polygon[:, 1].max()
            arc = top - 0.045 - 0.018 * np.cos((uvw[:, 0] - cx) / 0.06 * np.pi * 0.5) ** 2 * 0
            arc = top - 0.040 - 0.030 * (1.0 - ((uvw[:, 0] - cx) / 0.065) ** 2).clip(0, 1) ** 0.5
            deco = (stitch_line(uvw[:, 1], 0.0, along) * 0)
            deco = line_profile(uvw[:, 1] - arc, 0.0, 0.0005) * dash_profile(uvw[:, 0], 0.0034) * inside * (d > 0.012)
            deco += line_profile(uvw[:, 1] - arc, -0.005, 0.0005) * dash_profile(uvw[:, 0], 0.0034) * inside * (d > 0.012)
            return base + 0.13 * np.clip(stitches + deco, 0.0, 1.0) - 0.10 * line_profile(np.where(inside, d, -d), 0.0, 0.0006)

        return paint_fn

    for k, (poly, patch) in enumerate(back_pockets):
        details.append(Piece(f"back_pocket.{k}", patch, role="main", attach="carrier", uv="grid", paint=pocket_paint(poly), value=0.86, ao_strength=0.25))

    # -- 동전 주머니(오른쪽 앞)
    coin_poly = np.array([[-0.118, band_bottom_front - 0.006], [-0.080, band_bottom_front - 0.006], [-0.080, band_bottom_front - 0.050], [-0.118, band_bottom_front - 0.050]]) * np.array([1.0 if female else 1.0, 1.0])
    coin = surface_patch(surface, normals_c, FRONT, coin_poly, 0.0006, 0.0011, bevel=0.0015, grid=0.006)
    details.append(Piece("coin_pocket", coin, role="main", attach="carrier", uv="grid", paint=pocket_paint(coin_poly), value=0.86))

    # -- 지퍼 덮개(캐릭터 왼쪽, J 모양)
    details.append(fly_piece(surface, normals_c, band_bottom_front, lm.crotch_y, paint, 0.86, double=True))

    # -- 앞 주머니 곡선·뒤 요크·솔기(본판 텍스처)
    pocket_curves = []
    for sign in (1.0, -1.0):
        pts = []
        for t in np.linspace(0.0, 1.0, 24):
            phi = sign * (0.36 + 0.95 * t)
            yy = band_bottom_front - 0.004 - 0.085 * (math.sin(t * math.pi / 2) ** 1.3) + 0.0 * t
            hit = surface_point(surface, normals_c, np.array([math.sin(phi) * 0.6, yy, body.torso_center_z(np.array([yy]))[0] + math.cos(phi) * 0.6]), -np.array([math.sin(phi), 0.0, math.cos(phi)]))
            if hit is not None:
                pts.append(hit[0])
        if len(pts) > 4:
            pocket_curves.append(densify(np.array(pts), 0.002))
    pocket_field = PolylineField(np.concatenate(pocket_curves)) if pocket_curves else None
    yoke = []
    for sign in (1.0, -1.0):
        for t in np.linspace(0.0, 1.0, 20):
            phi = np.pi - sign * (1.45 * (1.0 - t))
            yy = band_bottom_back - 0.050 - 0.040 * t
            hit = surface_point(surface, normals_c, np.array([math.sin(phi) * 0.6, yy, body.torso_center_z(np.array([yy]))[0] + math.cos(phi) * 0.6]), -np.array([math.sin(phi), 0.0, math.cos(phi)]))
            if hit is not None:
                yoke.append(hit[0])
    yoke_field = PolylineField(densify(np.array(yoke), 0.002)) if len(yoke) > 4 else None

    def main_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        base = paint(points, uvw) if paint else np.full(len(points), 0.86)
        lr_v, fb_v = pants_panels(body, points)
        along = points[:, 1] * 1.0 + points[:, 0] * 0.3
        below = points[:, 1] < lm.crotch_y + 0.02
        outer = np.abs(points[:, 0]) > 0.04
        seam = line_profile(fb_v, 0.0, 0.0006) * (below | (np.abs(points[:, 0]) > 0.11))
        seam = np.maximum(seam, line_profile(lr_v, 0.0, 0.0006) * (points[:, 1] > lm.crotch_y - 0.02))
        stitch = stitch_line(fb_v, 0.0050, along) * (below & ~outer) + stitch_line(fb_v, 0.0050, along) * outer * 0.0
        stitch = np.maximum(stitch, stitch_line(np.abs(lr_v), 0.0055, along) * (points[:, 2] < body.torso_center_z(points[:, 1])) * (points[:, 1] > lm.crotch_y - 0.02))
        if pocket_field is not None:
            dp = pocket_field.distance(points)
            seam = np.maximum(seam, line_profile(dp, 0.0, 0.0007))
            stitch = np.maximum(stitch, stitch_line(dp, 0.0055, along))
        if yoke_field is not None:
            dy_ = yoke_field.distance(points)
            seam = np.maximum(seam, line_profile(dy_, 0.0, 0.0006))
            stitch = np.maximum(stitch, stitch_line(dy_, 0.0045, along) + stitch_line(dy_, 0.0085, along))
        return base - 0.12 * seam + 0.12 * np.clip(stitch, 0, 1)

    def band_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        base = paint(points, uvw) if paint else np.full(len(points), 0.86)
        y_rel = points[:, 1]
        frame = AxisFrame(body, "torso")
        _, _, theta, _ = frame.cyl(points)
        top = waist_line_y(spec, theta, body)
        along = theta * 0.15
        st = stitch_line(top - y_rel, 0.0045, along) + stitch_line(top - y_rel, spec.band_width - 0.0045, along)
        return base + 0.12 * np.clip(st, 0, 1)

    def cuff_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        base = paint(points, uvw) if paint else np.full(len(points), 0.86)
        along = np.arctan2(points[:, 0], points[:, 2]) * 0.1
        st = stitch_line(points[:, 1] - spec.hem_y, spec.cuff - 0.006, along)
        return base + 0.04 + 0.10 * np.clip(st, 0, 1)

    # -- 벨트 고리·버튼·리벳(트림)
    loops_angles = [np.pi] + [s_ * a for a in (0.62, 1.62, 2.50) for s_ in (1.0, -1.0)]
    loops_mesh = merge_meshes([belt_loops(band, body, [phi], float(waist_line_y(spec, np.array([phi]), body)[0]) - spec.band_width - 0.004, float(waist_line_y(spec, np.array([phi]), body)[0]) - 0.0015) for phi in loops_angles])
    hardware = []
    button_y = spec.waist_front - spec.band_width / 2
    hit = surface_point(band_surface, band_normals, np.array([0.0, button_y, 0.6]), np.array([0.0, 0.0, -1.0]))
    if hit is not None:
        hardware.append(button(hit[0] + hit[1] * 0.0008, hit[1], np.array([0.0, 1.0, 0.0]), 0.0080, 0.0032, segments=16))
    for sign in (1.0, -1.0):
        phi = sign * 0.36
        yy = band_bottom_front - 0.006
        hit = surface_point(surface, normals_c, np.array([math.sin(phi) * 0.6, yy, body.torso_center_z(np.array([yy]))[0] + math.cos(phi) * 0.6]), -np.array([math.sin(phi), 0.0, math.cos(phi)]))
        if hit is not None:
            hardware.append(button(hit[0], hit[1], np.array([0.0, 1.0, 0.0]), 0.0030, 0.0018, segments=10))

    def metal_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        r = np.linalg.norm(uvw, axis=1)
        return 0.97 - 0.10 * line_profile(r, 0.0055, 0.0006)

    pieces = [
        Piece("body", main, role="main", attach="body", uv="unwrap", paint=main_paint, value=0.86, smooth_group="shell", normal_smooth=8),
        Piece("waistband", band, role="trim", attach="body", uv="unwrap", paint=band_paint, value=0.86, compat_value=0.86),
        Piece("belt_loops", loops_mesh, role="trim", attach="carrier", uv="grid", paint=lambda p, u, v: (paint(p, u) if paint else 0.86) + 0.0, value=0.86, compat_value=0.86),
        Piece("buttons", merge_meshes(hardware), role="trim", attach="carrier", uv="grid", paint=metal_paint, value=0.96, compat_value=0.97),
    ] + details
    if cuff is not None:
        pieces.append(Piece("cuffs", cuff, role="trim", attach="carrier", uv="unwrap", paint=cuff_paint, value=0.90, compat_value=0.90))
    keys = [
        pants_length_key(body, spec.hem_y, 0.05, 0.10),
        looseness_key(0.012, 0.004),
        flare_key(body, spec.hem_y, 0.030, 0.008),
        rise_key(body, lm.hip_y - 0.02, spec.waist_back, 0.035, 0.025),
    ]
    return GarmentPlan("bottom", "jeans", 1, pieces, keys, [], {"spec": spec.__dict__ | {"paint": None}, **info})


# ---------------------------------------------------------------- 치마


def body_radius_rays(body: "BaseBody", y: np.ndarray, thetas: np.ndarray, reach: float = 0.6) -> np.ndarray:
    """몸통 축(높이별 앞뒤 중심)에서 각도마다 바깥에서 축 쪽으로 쏜 광선이 처음 닿는 몸 표면까지의 반지름(가장 바깥 표면). 안 닿으면 0."""
    y = np.broadcast_to(np.asarray(y, dtype=np.float64), thetas.shape)
    cz = body.torso_center_z(y)
    direction = np.stack([np.sin(thetas), np.zeros(len(thetas)), np.cos(thetas)], axis=1)
    origins = np.stack([np.zeros(len(thetas)), y, cz], axis=1) + direction * reach
    hits, tri = body.surface.ray(origins, -direction, reach)
    dist = np.linalg.norm(hits - origins, axis=1)
    return np.where(tri >= 0, reach - dist, 0.0)


def body_hull_radius(body: "BaseBody", y: float, thetas: np.ndarray, slab: float = 0.012) -> np.ndarray:
    """높이 y 단면(±`slab`)의 몸(몸통·골반·두 다리) 점들의 2D 볼록 껍질까지, 몸통 축에서 잰 각도별 반지름.

    다리 사이(앞·뒤 가운데)는 두 다리를 감싼 껍질 변 위의 거리라서, 치마가 다리 사이로 파고들지 않는다.
    """
    cz = float(body.torso_center_z(np.array([y]))[0])
    sel = np.abs(body.P[:, 1] - y) < slab
    pts = body.P[sel][:, [0, 2]] - np.array([0.0, cz])
    if len(pts) < 3:
        return np.full(len(thetas), 0.05)
    hull = gf_convex_hull_2d(pts)
    out = np.zeros(len(thetas))
    for k, th in enumerate(thetas):
        d = np.array([math.sin(th), math.cos(th)])
        best = 0.0
        for i in range(len(hull)):
            a, b = hull[i], hull[(i + 1) % len(hull)]
            # 원점에서 방향 d로 쏜 반직선과 변 ab의 교점
            e = b - a
            den = d[0] * (-e[1]) - d[1] * (-e[0])
            if abs(den) < 1e-12:
                continue
            t = (a[0] * (-e[1]) - a[1] * (-e[0])) / den
            u = (d[0] * a[1] - d[1] * a[0]) / den
            if t > 0 and -1e-9 <= u <= 1 + 1e-9:
                best = max(best, t)
        out[k] = best
    return out


def gf_convex_hull_2d(points: np.ndarray) -> np.ndarray:
    from character_kit.uvtools import _convex_hull

    return _convex_hull(points)


@dataclass
class SkirtSpec:
    name: str
    hem_y: float
    waist_front: float
    waist_back: float
    band_width: float = 0.034
    ease_band: float = 0.008
    ease_top: float = 0.011
    ease_hip: float = 0.016
    flare: float = 0.20  # 엉덩이 아래 높이당 반지름 증가(m/m)
    leg_clearance: float = 0.018  # 두 다리 볼록 껍질에서 떨어진 거리
    pleats: int = 0
    pleat_depth: float = 0.012
    pleat_stitch: float = 0.065  # 허리띠 아래 주름을 박아 둔 길이
    waves: int = 0
    wave_amp: float = 0.0
    rows: int = 44
    hem_soften: float = 0.35  # 밑단에서 칼주름이 부드러운 물결로 바뀌는 비율(0..1)
    hem_wave: float = 0.006  # 밑단에서 주름 봉우리가 더 내려오는 길이(m)
    cols_per_pleat: int = 9
    cols: int = 160
    leg_weight: float = 0.55  # 밑단에서 허벅지 본이 받는 최대 비중


PLEAT_PEAK = 0.90
PLEAT_S = np.array([0.0, 0.15, 0.30, 0.45, 0.60, 0.75, PLEAT_PEAK, 0.95])


def pleat_shape(s: np.ndarray) -> np.ndarray:
    """한 주름(0..1) 단면: 완만히 솟다가 끝에서 급히 접혀 내려간다(칼주름)."""
    s = np.asarray(s, dtype=np.float64)
    rise = s / PLEAT_PEAK
    drop = (1.0 - s) / (1.0 - PLEAT_PEAK)
    return np.clip(np.where(s < PLEAT_PEAK, rise, drop), 0.0, 1.0)


def skirt_columns(spec: SkirtSpec) -> tuple[np.ndarray, np.ndarray]:
    """열 각도(−π..π, 끝 중복 없음)와 주름 위상 s. 주름은 앞·뒤 가운데에서 좌우 대칭(왼쪽 반은 왼쪽으로, 오른쪽 반은 오른쪽으로 눕는다)."""
    if spec.pleats <= 0:
        thetas = np.linspace(-np.pi, np.pi, spec.cols, endpoint=False)
        return thetas, np.zeros(len(thetas))
    half = spec.pleats // 2
    width = np.pi / half
    thetas, phases = [], []
    for k in range(half):
        for s in PLEAT_S:
            thetas.append(k * width + s * width)
            phases.append(s)
    right = [(-t, s) for t, s in zip(thetas, phases) if t > 1e-9]
    left = list(zip(thetas, phases))
    allp = left + right
    allp.sort(key=lambda item: item[0])
    th = np.array([t for t, _ in allp])
    ph = np.array([s for _, s in allp])
    th = (th + np.pi) % (2 * np.pi) - np.pi
    order = np.argsort(th)
    th, ph = th[order], ph[order]
    keep = np.concatenate([[True], np.diff(th) > 1e-6])
    return th[keep], ph[keep]


def build_skirt_surface(ctx: BuildContext, spec: SkirtSpec) -> tuple[Mesh, Mesh, dict[str, Any]]:
    """치마 본판(격자)과 허리띠(고리 띠)를 만든다. (본판, 허리띠, 정보)."""
    body = ctx.body
    lm = body.landmarks
    thetas, phases = skirt_columns(spec)
    cols = len(thetas)
    waist = waist_line(body, thetas, spec.waist_front, spec.waist_back)
    band_bottom = waist - spec.band_width
    top_rows = band_bottom + 0.004  # 허리띠 속으로 4 mm 들어가 틈이 없게
    profile = BodyProfile(body)
    frame = profile.frame

    def body_radius(y: np.ndarray, th: np.ndarray) -> np.ndarray:
        return body_radius_rays(body, y, th)

    # 행 높이: 위에서 아래로(위쪽은 촘촘히)
    t_rows = np.linspace(0.0, 1.0, spec.rows) ** 1.15
    rows_y = np.array([top_rows + (spec.hem_y - top_rows) * t for t in t_rows])  # (rows, cols)
    radius = np.zeros((spec.rows, cols))
    prev = None
    for r_i in range(spec.rows):
        y_row = rows_y[r_i]
        y_mean = float(y_row.mean())
        r_body = body_radius(y_row, thetas)
        if y_mean < lm.crotch_y + 0.06:
            hull = body_hull_radius(body, y_mean, thetas)
            r_body = np.maximum(r_body, hull)
            ease = spec.leg_clearance
        else:
            ease = spec.ease_top + (spec.ease_hip - spec.ease_top) * smoothstep(float(top_rows.mean()), lm.hip_y, y_mean)
        r = r_body + ease
        if prev is not None:
            dy = float(rows_y[r_i - 1].mean() - y_mean)
            grow = spec.flare * dy * smoothstep(lm.hip_y + 0.06, lm.hip_y - 0.02, y_mean)
            r = np.maximum(r, prev + grow)
        # 각도 방향으로 살짝 다듬되(이웃 최댓값과 평균의 중간) 몸 안으로 들어가지 않게
        padded = np.concatenate([r[-2:], r, r[:2]])
        smooth = np.convolve(padded, np.ones(5) / 5.0, mode="valid")
        r = np.maximum(r, smooth)
        radius[r_i] = r
        prev = r
    # 주름·물결
    depth = np.zeros(spec.rows)
    if spec.pleats > 0:
        dist_down = np.array([float(top_rows.mean() - rows_y[i].mean()) for i in range(spec.rows)])
        depth = spec.pleat_depth * smoothstep(0.0, spec.pleat_stitch, dist_down) * (1.0 + 0.25 * smoothstep(spec.pleat_stitch, float(top_rows.mean() - spec.hem_y), dist_down))
        bump = pleat_shape(phases)
        soft = 0.5 - 0.5 * np.cos(2.0 * np.pi * phases)  # 밑단 쪽 부드러운 물결
        dist_down = np.array([float(top_rows.mean() - rows_y[i].mean()) for i in range(spec.rows)])
        total = max(float(top_rows.mean() - spec.hem_y), 1e-6)
        soften = spec.hem_soften * smoothstep(0.45 * total, total, dist_down)
        shape2d = (1.0 - soften[:, None]) * bump[None, :] + soften[:, None] * soft[None, :]
        radius = radius + depth[:, None] * (shape2d - 0.15)
        # 밑단 물결: 주름 봉우리가 조금 더 내려온다
        rows_y = rows_y - (spec.hem_wave * smoothstep(0.7 * total, total, dist_down))[:, None] * shape2d
    if spec.waves > 0 and spec.wave_amp > 0:
        amp = spec.wave_amp * smoothstep(lm.hip_y, spec.hem_y, rows_y.mean(axis=1))
        radius = radius + amp[:, None] * (0.5 + 0.5 * np.cos(spec.waves * thetas))[None, :]
    cz = body.torso_center_z(rows_y)
    positions = np.stack([radius * np.sin(thetas)[None, :], rows_y, cz + radius * np.cos(thetas)[None, :]], axis=2)
    # 격자(이음매는 뒤 가운데 θ = ±π, 열 복제) + 밑단 접힘 두 줄(안쪽 3 mm → 위로 1.3 cm)
    grid = np.concatenate([positions, positions[:, :1]], axis=1)  # (rows, cols+1, 3)
    bottom = grid[-1]
    tangent_down = grid[-1] - grid[-2]
    radial = np.stack([bottom[:, 0], np.zeros(len(bottom)), bottom[:, 2] - body.torso_center_z(bottom[:, 1])], axis=1)
    radial /= np.maximum(np.linalg.norm(radial, axis=1, keepdims=True), 1e-9)
    tangent_down /= np.maximum(np.linalg.norm(tangent_down, axis=1, keepdims=True), 1e-9)
    hem_thickness, hem_depth = 0.0030, 0.013
    inner = bottom - radial * hem_thickness
    upper = inner - tangent_down * hem_depth
    grid = np.concatenate([grid, inner[None], upper[None]], axis=0)
    n_rows, n_cols = grid.shape[0], grid.shape[1]
    flat = grid.reshape(-1, 3)
    tris = []
    for r_i in range(n_rows - 1):
        for c in range(n_cols - 1):
            a = r_i * n_cols + c
            b = a + 1
            d = a + n_cols
            e = d + 1
            tris += [[a, d, e], [a, e, b]]
    tris = np.array(tris, dtype=np.int64)
    # UV: 행마다 실제 표면 호길이(주름 따라), v = 허리에서 내려온 거리(접힘 두 줄은 그 아래로 이어 붙인다)
    body_rows = spec.rows
    seg = np.linalg.norm(np.diff(grid[:body_rows], axis=1), axis=2)
    u = np.concatenate([np.zeros((body_rows, 1)), np.cumsum(seg, axis=1)], axis=1)
    u -= u[:, [n_cols // 2]]
    v = np.concatenate([np.zeros((1, n_cols)), np.cumsum(np.linalg.norm(np.diff(grid[:body_rows], axis=0), axis=2), axis=0)], axis=0)
    u = np.concatenate([u, u[-1:], u[-1:]], axis=0)
    v = np.concatenate([v, v[-1:] + hem_thickness, v[-1:] + hem_thickness + hem_depth], axis=0)
    uvw = np.stack([u, v], axis=2).reshape(-1, 2)
    column_phase = np.concatenate([phases, phases[:1]])
    phase_grid = column_phase[None, :].repeat(n_rows, axis=0).reshape(-1)
    row_index = np.repeat(np.arange(n_rows), n_cols).astype(np.float64)
    mesh = Mesh(flat, tris, {"uvw": uvw, "phase": phase_grid, "row": row_index})
    outward_dir = np.stack([flat[:, 0], np.zeros(len(flat)), flat[:, 2] - body.torso_center_z(flat[:, 1])], axis=1)
    # 바깥면(치마 본판)이 바깥을 보게 감김을 정한다(접힘 줄도 같은 감김 규칙을 따른다)
    body_tris = tris[: (body_rows - 1) * (n_cols - 1) * 2]
    a0, b0, c0 = (flat[body_tris[:, k]] for k in range(3))
    facing = np.einsum("ij,ij->i", np.cross(b0 - a0, c0 - a0), outward_dir[body_tris[:, 0]])
    if float(np.median(facing)) < 0:
        mesh.triangles = mesh.triangles[:, [0, 2, 1]]
    if spec.pleats > 0:
        mesh = crisp_fold_normals(mesh, n_rows, n_cols, column_phase)

    # 허리띠: 몸 반지름 + 여유, 4행 띠 + 위 접힘
    band_rows = []
    for k, frac in enumerate(np.linspace(0.0, 1.0, 5)):
        y_k = waist - spec.band_width * frac
        r_k = body_radius(y_k, thetas) + spec.ease_band
        r_k = np.maximum(r_k, radius[0] - 0.002 if k == 4 else r_k)
        band_rows.append(np.stack([r_k * np.sin(thetas), y_k, body.torso_center_z(y_k) + r_k * np.cos(thetas)], axis=1))
    band_rows[-1] = band_rows[-1]  # 아래 가장자리
    band = ring_strip(band_rows, closed=True)
    band.triangles = orient_like(band.positions, band.triangles, lambda c: np.stack([c[:, 0], np.zeros(len(c)), c[:, 2] - body.torso_center_z(c[:, 1])], axis=1))
    band_normals = welded_normals(band)
    cols_b = cols + 1
    top_loop = np.arange(0, cols_b)
    down = np.tile(np.array([0.0, -1.0, 0.0]), (len(top_loop), 1))
    band = add_fold_open(band, top_loop, band_normals, down, 0.0030, 0.012)
    bottom_loop = np.arange(4 * cols_b, 5 * cols_b)
    band = add_fold_open(band, bottom_loop, welded_normals(band), np.tile(np.array([0.0, 1.0, 0.0]), (len(bottom_loop), 1)), 0.0025, 0.008)
    info = {"thetas": thetas, "phases": phases, "rows": n_rows, "cols": n_cols, "waist": waist, "pleatDepth": depth}
    return mesh, band, info


def crisp_fold_normals(mesh: Mesh, n_rows: int, n_cols: int, column_phase: np.ndarray) -> Mesh:
    """주름 접힘선(봉우리·골 열)에서 정점을 둘로 나눠 면마다 따로 법선을 준다 — 툰 램프에서 주름 경계가 칼같이 선다.

    열 c와 c+1 사이 면은 "오르막"(위상 증가) 또는 "내리막" 띠다. 접힘 열(봉우리·골)의 정점은 양쪽 띠가 각자 복제본을 쓴다.
    법선은 띠 안에서만 평균해 `normal` 속성으로 둔다(조립 때 위치 용접으로 다시 섞이지 않게).
    """
    positions = mesh.positions.reshape(n_rows, n_cols, 3)
    # 띠 종류는 주름 단면의 기울기로 정한다(위상 증가가 아니라): 봉우리(PLEAT_PEAK)와 골(0) 양쪽에서 갈라져야 칼주름이 선다
    profile = pleat_shape(column_phase)
    strip_kind = np.where(np.diff(profile) > 0, 0, 1)  # 0 오르막, 1 내리막 (n_cols-1,)
    # 띠 경계(종류가 바뀌는 열)마다 정점을 복제한다
    new_positions, new_uv, new_phase, new_row, new_normal = [], [], [], [], []
    index = -np.ones((n_rows, n_cols, 2), dtype=np.int64)  # [행, 열, 왼쪽 띠/오른쪽 띠] → 정점 번호
    uvw = mesh.attrs["uvw"].reshape(n_rows, n_cols, 2)
    count = 0
    for c in range(n_cols):
        left_kind = strip_kind[c - 1] if c > 0 else None
        right_kind = strip_kind[c] if c < n_cols - 1 else None
        split = left_kind is not None and right_kind is not None and left_kind != right_kind
        copies = 2 if split else 1
        for r in range(n_rows):
            for k in range(copies):
                new_positions.append(positions[r, c])
                new_uv.append(uvw[r, c])
                new_phase.append(column_phase[c])
                new_row.append(float(r))
                index[r, c, k if split else 0] = count
                if not split:
                    index[r, c, 1] = count
                count += 1
    tris = []
    for r in range(n_rows - 1):
        for c in range(n_cols - 1):
            a, b = index[r, c, 1], index[r, c + 1, 0]
            d, e = index[r + 1, c, 1], index[r + 1, c + 1, 0]
            tris += [[a, d, e], [a, e, b]]
    out = Mesh(np.array(new_positions), np.array(tris, dtype=np.int64), {"uvw": np.array(new_uv), "phase": np.array(new_phase), "row": np.array(new_row)})
    # 원래 감김 방향을 유지(바깥)
    ref = mesh.triangles[0]
    a0, b0, c0 = mesh.positions[ref]
    want = np.cross(b0 - a0, c0 - a0)
    t0 = out.triangles[0]
    got = np.cross(out.positions[t0[1]] - out.positions[t0[0]], out.positions[t0[2]] - out.positions[t0[0]])
    if float(want @ got) < 0:
        out.triangles = out.triangles[:, [0, 2, 1]]
    out.attrs["normal"] = vertex_normals(out.positions, out.triangles)
    return out


def add_fold_open(mesh: Mesh, loop: np.ndarray, normals: np.ndarray, into: np.ndarray, thickness: float, depth: float) -> Mesh:
    """`add_fold`와 같지만 UV 격자 속성(`uvw`)이 있는 메시용: 이음매 복제 정점까지 포함한 열린 정점 열에 접힘을 붙이고 새 고리의 uvw를 v 방향으로 잇는다."""
    out = add_fold(mesh, loop, normals, into, thickness, depth, closed=False)
    if "uvw" in mesh.attrs:
        base = mesh.count
        count = len(loop)
        uv = out.attrs["uvw"]
        sign = 1.0 if np.mean(into[:, 1]) <= 0 else -1.0
        uv[base : base + count] = mesh.attrs["uvw"][loop] + np.array([0.0, sign * thickness])
        uv[base + count : base + 2 * count] = mesh.attrs["uvw"][loop] + np.array([0.0, sign * (thickness + depth)])
        out.attrs["uvw"] = uv
    return out


def skirt_skin(rig: "BodyRig", body: "BaseBody", mesh: Mesh, top_y: float, hem_y: float, leg_weight: float) -> np.ndarray:
    """치마 웨이트: 허리 쪽은 몸 웨이트, 아래로 갈수록 골반(Hips) + 좌우 허벅지(UpLeg) 섞음(옆은 그쪽 다리, 앞·뒤 가운데는 반반) — 다리 사이에서 찢어지지 않는다."""
    p = mesh.positions
    normals = outward(welded_normals(mesh), p, body)
    near = rig.skin(p, normals)
    custom = np.zeros_like(near)
    frame = AxisFrame(body, "torso")
    _, _, theta, _ = frame.cyl(p)
    t = smoothstep(top_y - 0.02, hem_y, p[:, 1])
    leg = leg_weight * t
    left = np.clip(0.5 + 0.5 * np.sin(theta) / 0.7, 0.0, 1.0)
    custom[:, rig.joint_index("Hips")] = 1.0 - leg
    custom[:, rig.joint_index("LeftUpLeg")] = leg * left
    custom[:, rig.joint_index("RightUpLeg")] = leg * (1.0 - left)
    blend = smoothstep(top_y - 0.01, top_y - 0.09, p[:, 1])
    out = (1.0 - blend)[:, None] * near + blend[:, None] * custom
    return out / np.maximum(out.sum(axis=1, keepdims=True), 1e-9)


def skirt_radial_key(name: str, body: "BaseBody", hem_y: float, plus: float, minus: float, start: float, weight: Callable[[ShapeContext], np.ndarray] | None = None, note: str = "") -> ShapeKey:
    """치마 반지름 방향 변형(퍼짐·주름 깊이·물결): 몸통 축에서 바깥(+)·안(−)으로, `start` 높이부터 밑단으로 갈수록 크게."""

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        frame = AxisFrame(ctx.body, "torso")
        _, _, _, direction = frame.cyl(ctx.positions)
        w = smoothstep(start, hem_y, ctx.positions[:, 1])
        if weight is not None:
            w = w * weight(ctx)
        return direction * (sign * (plus if sign > 0 else minus) * w)[:, None]

    return ShapeKey(name, delta, note_ko=note)


def skirt_length_key(body: "BaseBody", hem_y: float, plus: float, minus: float) -> ShapeKey:
    lm = body.landmarks

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        w = smoothstep(lm.hip_y, hem_y, ctx.positions[:, 1])
        out = np.zeros_like(ctx.positions)
        out[:, 1] = -sign * (plus if sign > 0 else minus) * w
        # 기장이 길어지면 같은 비율로 퍼짐도 이어진다(A라인 유지)
        frame = AxisFrame(ctx.body, "torso")
        _, _, _, direction = frame.cyl(ctx.positions)
        return out + direction * (0.18 * sign * (plus if sign > 0 else minus) * w)[:, None]

    return ShapeKey("length", delta, note_ko=f"기장 +{plus * 100:.0f} cm / −{minus * 100:.0f} cm")


def skirt_plan(ctx: BuildContext, spec: SkirtSpec, paint_main: Callable[[np.ndarray, np.ndarray, str], np.ndarray], keys: list[ShapeKey]) -> GarmentPlan:
    body = ctx.body
    rig = ctx.get_rig()
    main, band, info = build_skirt_surface(ctx, spec)
    top_y = float(np.mean(info["waist"])) - spec.band_width
    main.attrs["skin"] = skirt_skin(rig, body, main, top_y, spec.hem_y, spec.leg_weight)

    def band_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        frame = AxisFrame(body, "torso")
        _, _, theta, _ = frame.cyl(points)
        top = waist_line(body, theta, spec.waist_front, spec.waist_back)
        along = theta * 0.12
        st = stitch_line(top - points[:, 1], 0.004, along) + stitch_line(top - points[:, 1], spec.band_width - 0.004, along)
        return 0.93 - 0.10 * np.clip(st, 0, 1) + 0.008 * hash_noise(points, 0.003)

    pieces = [
        Piece("skirt", main, role="main", attach="skirt", uv="grid", paint=paint_main, value=0.93, normal_smooth=0, ao_strength=0.30),
        Piece("waistband", band, role="trim", attach="body", uv="grid", paint=band_paint, value=0.93, compat_value=0.82),
    ]
    return GarmentPlan("bottom", spec.name, 1, pieces, keys, [], {"hemY": spec.hem_y, "pleats": spec.pleats, "pleatDepth": spec.pleat_depth})


def build_pleated_skirt(ctx: BuildContext, pleats: int = 10, depth: float = 0.032) -> GarmentPlan:
    """주름치마: 허리띠(트림, 옆 단추), 좌우 대칭 칼주름 `pleats`개(깊이 `depth`, 허리 아래 8.5 cm는 박음), 엉덩이에서 퍼지는 A라인, 접힌 밑단. 두 다리를 감싼 볼록 껍질 바깥."""
    body = ctx.body
    lm = body.landmarks
    front, back = effective_waist(body, lm.waist_y - (0.050 if body.base_id == "female" else 0.075), lm.waist_y - (0.035 if body.base_id == "female" else 0.060))
    spec = SkirtSpec(name="pleated-skirt", hem_y=lm.crotch_y - 0.215, waist_front=front, waist_back=back, flare=0.22, pleats=pleats, pleat_depth=depth, rows=26, hem_soften=0.25)
    width = np.pi / max(pleats // 2, 1)

    def paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        hem_stitch = stitch_line(points[:, 1] - spec.hem_y, 0.010, uvw[:, 0], 0.0005, 0.0034)
        # 주름 골(다음 주름이 시작하는 접힘 안쪽)의 그늘과 봉우리 모서리의 밝은 선 — 입체 주름을 또렷하게(형상이 주, 무늬는 보조)
        _, _, theta, _ = AxisFrame(body, "torso").cyl(points)
        phase = np.mod(np.abs(theta) / width, 1.0)
        below = smoothstep(float(np.mean(waist_line(body, np.array([0.0, np.pi]), front, back))) - spec.band_width - 0.02, float(np.mean(waist_line(body, np.array([0.0, np.pi]), front, back))) - spec.band_width - 0.07, points[:, 1])
        valley = (1.0 - smoothstep(0.0, 0.035, np.minimum(phase, 1.0 - phase))) * below
        crest = (1.0 - smoothstep(0.0, 0.03, np.abs(phase - PLEAT_PEAK))) * below
        return 0.93 + 0.008 * hash_noise(points, 0.003, seed=31) - 0.10 * hem_stitch - 0.10 * valley + 0.04 * crest

    keys = [
        skirt_length_key(body, spec.hem_y, 0.09, 0.07),
        skirt_radial_key("flare", body, spec.hem_y, 0.040, 0.020, lm.hip_y + 0.02, note="퍼짐 +40 mm / −20 mm"),
        skirt_radial_key("pleat", body, spec.hem_y, 0.008, 0.008, lm.hip_y + 0.08, weight=lambda c: pleat_shape(np.nan_to_num(c.attrs.get("phase", np.zeros(len(c.positions))))) - 0.15, note="주름 깊이 ±8 mm"),
        rise_key(body, lm.hip_y + 0.02, front, 0.030, 0.030),
    ]
    return skirt_plan(ctx, spec, paint, keys)


def build_long_skirt(ctx: BuildContext) -> GarmentPlan:
    """A라인 롱스커트: 허리띠(트림), 엉덩이에서 퍼지는 종아리 중간 기장, 밑단으로 갈수록 깊어지는 부드러운 물결 주름 7개, 접힌 밑단. 두 다리를 감싼 볼록 껍질 바깥."""
    body = ctx.body
    lm = body.landmarks
    front, back = effective_waist(body, lm.waist_y - (0.050 if body.base_id == "female" else 0.075), lm.waist_y - (0.035 if body.base_id == "female" else 0.060))
    spec = SkirtSpec(name="long-skirt", hem_y=lm.knee_y - 0.195, waist_front=front, waist_back=back, flare=0.24, waves=7, wave_amp=0.022, rows=34, cols=140, leg_clearance=0.022, leg_weight=0.5)

    def paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        hem_stitch = stitch_line(points[:, 1] - spec.hem_y, 0.011, uvw[:, 0], 0.0005, 0.0034)
        return 0.94 + 0.008 * hash_noise(points, 0.003, seed=37) - 0.10 * hem_stitch

    keys = [
        skirt_length_key(body, spec.hem_y, 0.08, 0.14),
        skirt_radial_key("flare", body, spec.hem_y, 0.05, 0.03, lm.hip_y, note="퍼짐 +50 mm / −30 mm"),
        skirt_radial_key("wave", body, spec.hem_y, 0.012, 0.012, lm.hip_y, weight=lambda c: np.cos(7 * AxisFrame(c.body, "torso").cyl(c.positions)[2]), note="물결 깊이 ±12 mm"),
        rise_key(body, lm.hip_y + 0.02, front, 0.030, 0.030),
    ]
    return skirt_plan(ctx, spec, paint, keys)


# ---------------------------------------------------------------- 칼라·플래킷·단추줄


def loop_by_angle(points: np.ndarray, body: "BaseBody") -> tuple[np.ndarray, np.ndarray]:
    """고리 점들을 목 축 둘레 각도로 정렬한다. (각도 오름차순, 점)."""
    phi, _ = neck_polar(body, points)
    order = np.argsort(phi)
    return phi[order], points[order]


def sample_loop(phi_sorted: np.ndarray, points_sorted: np.ndarray, query: np.ndarray) -> np.ndarray:
    """각도로 정렬한 고리에서 질의 각도의 점(주기 보간)."""
    ext_phi = np.concatenate([phi_sorted - 2 * np.pi, phi_sorted, phi_sorted + 2 * np.pi])
    ext_pts = np.concatenate([points_sorted, points_sorted, points_sorted])
    return np.stack([np.interp(query, ext_phi, ext_pts[:, k]) for k in range(3)], axis=1)


def neck_radius_rays(body: "BaseBody", y: np.ndarray, phi: np.ndarray, reach: float = 0.25) -> np.ndarray:
    """목 축(높이 y)에서 각도 φ로 바깥을 향해 쏜 광선이 처음 닿는 몸·머리 표면까지의 반지름(목 둘레).

    축 안쪽에서 바깥으로 쏘므로 옆(목 옆 높이에서 어깨·승모근이 더 바깥에 있는 곳)에서도 목 표면을 잰다. 안 닿으면 5 cm.
    """
    zc = body.landmarks.neck_axis_z
    y = np.broadcast_to(np.asarray(y, dtype=np.float64), np.shape(phi))
    direction = np.stack([np.sin(phi), np.zeros(len(phi)), np.cos(phi)], axis=1)
    origins = np.stack([np.zeros(len(phi)), y, np.full(len(phi), zc)], axis=1)
    hits, tri = body.surface.ray(origins, direction, reach)
    dist = np.linalg.norm(hits - origins, axis=1)
    return np.where(tri >= 0, dist, 0.05)


def walk_on_surface(surface: Surface, normals: np.ndarray, start: np.ndarray, direction: np.ndarray, length: float, steps: int = 6, lift: float = 0.0) -> np.ndarray:
    """표면 위를 `direction` 쪽으로 `length`만큼 걸어간 점들(각 걸음마다 표면에 다시 붙인다). 반환 (steps+1, k, 3)."""
    out = [start.copy()]
    p = start.copy()
    d = direction / np.maximum(np.linalg.norm(direction, axis=1, keepdims=True), 1e-12)
    for _ in range(steps):
        q = p + d * (length / steps)
        hits = surface.closest(q)
        corners = surface.triangles[np.maximum(hits.triangle, 0)]
        n = np.einsum("mc,mck->mk", hits.bary, normals[corners])
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        new_p = hits.point + n * lift
        d = new_p - p
        d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-12)
        p = new_p
        out.append(p.copy())
    return np.stack(out)


@dataclass
class CollarSpec:
    """셔츠 칼라(스탠드 + 접힘 + 날개) 설계값(m, rad)."""

    open_angle: float = 0.05  # 앞 가운데에서 칼라 앞 끝 열까지의 목 축 각도(스탠드 앞 끝이 거의 맞닿는다)
    stand_back: float = 0.026  # 스탠드 높이(뒤)
    stand_front: float = 0.019
    neck_gap: float = 0.0042  # 스탠드 안쪽 면과 목 사이
    fold_radius: float = 0.0024  # 접힘(스탠드 위에서 날개로 넘어가는 곳) 반지름
    cover_back: float = 0.013  # 날개 바깥 가장자리가 목둘레 솔기를 덮고 내려오는 표면 거리(뒤)
    cover_side: float = 0.011
    point_length: float = 0.058  # 칼라 끝: 앞 열 목둘레점에서 셸을 따라 내려간 길이
    point_spread: float = 0.78  # 칼라 끝이 옆(바깥)으로 벌어지는 정도(아래 방향 대비)
    point_reach: float = 1.0  # 칼라 끝에서 옆 가장자리 길이로 바뀌는 각도 범위(rad) — 아랫변이 곧게 이어진다
    roll: float = 0.0028  # 날개 가운데가 접힘 쪽으로 부푼 높이(앞 끝은 납작)
    tuck: float = 0.004  # 스탠드 아래 끝이 셸 목둘레 가장자리를 덮고 내려간 길이
    leaf_gap: float = 0.0012  # 날개 안쪽 면과 셸 사이
    obstacle_rows: str = "leaf"  # 장애물(넥타이·아래 레이어 칼라) 바깥으로 밀 행: "leaf" 날개만 / "all" 스탠드까지
    columns: int = 22  # 반쪽 열 수
    stand_rows: int = 3
    leaf_rows: int = 6
    thickness: float = 0.0020


def shell_normal_at(surface: Surface, normals: np.ndarray, points: np.ndarray, body: "BaseBody") -> tuple[np.ndarray, np.ndarray]:
    """셸 표면 최근접점과 그 점의 몸 바깥쪽 법선."""
    hits = surface.closest(points)
    corners = surface.triangles[np.maximum(hits.triangle, 0)]
    n = np.einsum("mc,mck->mk", hits.bary, normals[corners])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return hits.point, outward(n, hits.point, body)


def shirt_collar(body: "BaseBody", shell: Mesh, neck_points: np.ndarray, spec: CollarSpec, obstacles: list[Mesh] | None = None) -> tuple[Mesh, dict[str, Any]]:
    """셔츠 칼라를 두께 있는 한 장의 판으로 만든다: 스탠드(목둘레에서 목을 감싸며 선다) → 접힘 → 날개(스탠드를 덮고 내려와 목둘레 솔기를 가린다).

    왼쪽 반(목 축 각도 `open_angle`..π)을 만들고 거울로 오른쪽 반을 붙여 **뒤 가운데에서 이어지고 앞에서 열린** 띠가 된다.
    앞 끝 열의 날개는 셸을 따라 `point_length`만큼 내려가며 옆으로 벌어져 뾰족한 칼라 끝이 되고, 칼라 끝에서 옆 가장자리까지 아랫변은 곧게 이어진다.
    `obstacles`(넥타이 등)가 있으면 날개는 그 위에 얹힌다(넥타이가 칼라 끝 아래로 지나간다).
    돌려주는 값: (메시, 정보 {"front_top": 앞 스탠드 위 가운데 점, "front_mid": 앞 스탠드 2/3 높이 가운데 점, "outer_edge": 날개 바깥 가장자리 점 열}).
    정점 속성 `leaf`는 날개에서 접힘 0 → 바깥 가장자리 1, 스탠드·접힘은 0이고, `leaf_dx/dy/dz`는 접힘 끝 → 가장자리 벡터(m)다(형태 키 `collar`가 날개만 늘인다).
    """
    phi_sorted, pts_sorted = loop_by_angle(neck_points, body)
    surface, normals_c = surface_frame_normals(shell)
    zc = body.landmarks.neck_axis_z
    t = np.linspace(0.0, 1.0, spec.columns)
    phis = spec.open_angle + (np.pi - spec.open_angle) * t ** 1.25  # 앞쪽 열을 촘촘히(칼라 끝)
    base = sample_loop(phi_sorted, pts_sorted, phis)
    radial = np.stack([np.sin(phis), np.zeros(len(phis)), np.cos(phis)], axis=1)
    up = np.array([0.0, 1.0, 0.0])
    _, n_base = shell_normal_at(surface, normals_c, base, body)
    tangent = np.gradient(base, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-12)
    away = np.cross(tangent, n_base)
    away /= np.maximum(np.linalg.norm(away, axis=1, keepdims=True), 1e-12)
    flip = (np.einsum("ij,ij->i", away, radial) - away[:, 1]) < 0.0  # 목에서 멀어지거나 아래로
    away[flip] *= -1.0
    front_w = (1.0 - smoothstep(0.0, spec.point_reach, phis - spec.open_angle)) ** 1.5
    lift = spec.thickness + 0.0006
    # 행 0: 목둘레 아래로 `tuck`만큼 셸을 덮은 스탠드 밑단, 행 1: 목둘레
    tuck = np.array([walk_on_surface(surface, normals_c, base[k : k + 1], away[k : k + 1], spec.tuck, steps=2)[-1, 0] for k in range(len(base))])
    _, n_tuck = shell_normal_at(surface, normals_c, tuck, body)
    rows: list[np.ndarray] = [tuck + n_tuck * lift, base + n_base * lift]
    t_front = 1.0 - smoothstep(0.0, 1.5, phis)
    stand_h = spec.stand_back + (spec.stand_front - spec.stand_back) * t_front
    rho1 = np.hypot(rows[1][:, 0], rows[1][:, 2] - zc)
    stand_y, stand_rho = [rows[1][:, 1]], [rho1]
    for j in range(1, spec.stand_rows + 1):
        f = j / spec.stand_rows
        y = base[:, 1] + stand_h * f
        r_min = neck_radius_rays(body, y, phis) + spec.neck_gap + spec.thickness
        rho = (1.0 - smoothstep(0.0, 1.0, f)) * rho1 + smoothstep(0.0, 1.0, f) * np.minimum(r_min, rho1)
        rho = np.maximum(rho, r_min)
        rows.append(np.stack([radial[:, 0] * rho, y, zc + radial[:, 2] * rho], axis=1))
        stand_y.append(y)
        stand_rho.append(rho)
    top = rows[-1]
    rf = spec.fold_radius
    for a in np.linspace(0.0, np.pi, 5)[1:]:
        rows.append(top + radial * (rf * (1.0 - math.cos(a))) + up * (rf * math.sin(a)))
    fold_end = rows[-1]
    # 날개 바깥 가장자리: 목둘레점에서 셸을 따라 걷는다(앞은 칼라 끝으로 길고 옆으로 벌어진다)
    s = np.clip((phis - spec.open_angle) / spec.point_reach, 0.0, 1.0)
    cover = spec.cover_side + (spec.cover_back - spec.cover_side) * smoothstep(np.pi / 2, np.pi, phis)
    length = spec.point_length * (1.0 - s) + cover * s
    side_dir = np.tile(np.array([1.0, 0.0, 0.0]), (len(base), 1))
    walk_dir = away + side_dir * (spec.point_spread * front_w)[:, None]
    edge = np.array([walk_on_surface(surface, normals_c, base[k : k + 1], walk_dir[k : k + 1], float(length[k]), steps=6)[-1, 0] for k in range(len(base))])
    _, n_edge = shell_normal_at(surface, normals_c, edge, body)
    edge = edge + n_edge * (spec.thickness + spec.leaf_gap)
    roll = spec.roll * (1.0 - 0.7 * front_w)
    leaf_rows = []
    for j in range(1, spec.leaf_rows + 1):
        v = (j / spec.leaf_rows) ** 1.15
        p = fold_end + (edge - fold_end) * v + n_edge * (roll * 4.0 * v * (1.0 - v))[:, None]
        leaf_rows.append(p)
    leaf = np.stack(leaf_rows)  # (L, C, 3)
    # 날개는 스탠드 바깥(목 축 반지름)과 셸 바깥에 있어야 한다
    sy, sr = np.stack(stand_y), np.stack(stand_rho)
    shell_out = outward(normals_c, shell.positions, body)
    for _ in range(2):
        for k in range(len(base)):
            pts = leaf[:, k]
            rho = np.hypot(pts[:, 0], pts[:, 2] - zc)
            within = (pts[:, 1] >= sy[0, k] - 0.002) & (pts[:, 1] <= sy[-1, k] + rf)
            r_need = np.interp(pts[:, 1], sy[:, k], sr[:, k]) + 2.0 * spec.thickness + 0.0008
            grow = np.where(within, np.maximum(r_need - rho, 0.0), 0.0)
            direction = np.stack([pts[:, 0], np.zeros(len(pts)), pts[:, 2] - zc], axis=1) / np.maximum(rho, 1e-9)[:, None]
            leaf[:, k] = pts + direction * grow[:, None]
        flat = push_outside(leaf.reshape(-1, 3), surface, shell_out, spec.thickness + spec.leaf_gap)
        for obstacle in obstacles or []:
            o_surface = Surface(obstacle.positions, obstacle.triangles)
            o_normals = outward(welded_normals(obstacle), obstacle.positions, body)
            flat = push_outside(flat, o_surface, o_normals, spec.thickness + 0.0010)
        leaf = flat.reshape(leaf.shape)
    half = np.concatenate([np.stack(rows), leaf])  # (R, C, 3) 왼쪽 반: 앞(열 0) → 뒤
    n_stand = len(rows)
    if spec.obstacle_rows == "all" and obstacles:
        # 아래 레이어 칼라 위에 얹히는 아우터 칼라: 스탠드·접힘도 장애물 바깥으로(행 0은 셸을 덮는 밑단이라 그대로)
        body_rows = half[1:n_stand].reshape(-1, 3)
        for obstacle in obstacles:
            body_rows = surface_push_constraint(obstacle, body, spec.thickness + 0.0012, reach=0.06)(body_rows)
        half[1:n_stand] = body_rows.reshape(half[1:n_stand].shape)
    leaf_attr = np.zeros(half.shape[:2])
    leaf_attr[n_stand:] = ((np.arange(1, spec.leaf_rows + 1) / spec.leaf_rows) ** 1.15)[:, None]
    span = leaf[-1] - fold_end  # (C,3) 접힘 끝 → 가장자리
    span_attr = np.zeros(half.shape)
    span_attr[n_stand:] = span[None]
    # 오른쪽 반(거울, 앞 → 뒤) + 왼쪽 반(뒤 → 앞): 뒤 가운데에서 이어지고 앞에서 열린 띠
    mirror = half.copy()
    mirror[:, :, 0] *= -1.0
    full = np.concatenate([mirror, half[:, ::-1][:, 1:]], axis=1)
    leaf_full = np.concatenate([leaf_attr, leaf_attr[:, ::-1][:, 1:]], axis=1)
    span_mirror = span_attr.copy()
    span_mirror[:, :, 0] *= -1.0
    span_full = np.concatenate([span_mirror, span_attr[:, ::-1][:, 1:]], axis=1)
    # 바깥면이 목에서 멀어지는 쪽(스탠드 행 기준)을 보게
    gn = grid_normals(full)
    mid = full[1 : n_stand - 4]
    rad = np.concatenate([mid[..., :1], np.zeros(mid.shape[:2] + (1,)), mid[..., 2:3] - zc], axis=2)
    flip_solid = float(np.einsum("ijk,ijk->", gn[1 : n_stand - 4], rad)) < 0.0
    mesh = solidify_grid(full, spec.thickness, flip=flip_solid, attrs={"leaf": leaf_full, "leaf_dx": span_full[..., 0], "leaf_dy": span_full[..., 1], "leaf_dz": span_full[..., 2]})
    front_top = 0.5 * (full[n_stand - 5, 0] + full[n_stand - 5, -1])
    mid_row = 1 + spec.stand_rows // 2 + 1
    front_mid = 0.5 * (full[mid_row, 0] + full[mid_row, -1])
    out_n = grid_normals(full) * (-1.0 if flip_solid else 1.0)
    info = {
        "front_top": front_top,
        "front_mid": front_mid,
        "front_ends": (full[mid_row, 0].copy(), full[mid_row, -1].copy()),
        "front_end_normals": (out_n[mid_row, 0].copy(), out_n[mid_row, -1].copy()),
        "outer_edge": full[-1].copy(),
        "outer_edge_normals": out_n[-1].copy(),
        "inner_rows": full[-2].copy(),
        "stand_rows": n_stand,
    }
    return mesh, info


def collar_leaf_key(plus: float, minus: float, shell_piece: str = "body", gap: float = 0.0032, name: str = "collar", label_ko: str = "칼라 날개") -> ShapeKey:
    """칼라 크기: 날개(접힘 → 가장자리)만 그 방향으로 늘이거나(+) 줄인다(−). 늘어난 날개는 셸 바깥에 머문다.
    같은 방식으로 후드 크기(`hood`)·라펠 폭(`lapel`) 키도 만든다."""

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        out = np.zeros_like(ctx.positions)
        leaf = ctx.attrs.get("leaf")
        if leaf is None:
            return out
        mask = np.isfinite(leaf) & (leaf > 0.0)
        if not mask.any():
            return out
        span = np.stack([ctx.attrs["leaf_dx"][mask], ctx.attrs["leaf_dy"][mask], ctx.attrs["leaf_dz"][mask]], axis=1)
        moved = ctx.positions[mask] + span * (sign * (plus if sign > 0 else minus) * leaf[mask])[:, None]
        shells = [p.mesh for p in ctx.pieces if p.name == shell_piece]
        if shells:
            shell = shells[0]
            moved = push_outside(moved, Surface(shell.positions, shell.triangles), outward(welded_normals(shell), shell.positions, ctx.body), gap)
        out[mask] = moved - ctx.positions[mask]
        return out

    return ShapeKey(name, delta, d_min=0.004, note_ko=f"{label_ko} +{plus * 100:.0f}% / −{minus * 100:.0f}%")


def place_bow(center: np.ndarray, normal: np.ndarray, up: np.ndarray, obstacles: list[tuple[Surface, np.ndarray]], gap: float = 0.0012, **params: Any) -> dict[str, Mesh]:
    """리본을 장애물(칼라·가리개·셸) 앞에 놓는다: 매듭·날개는 통째로 앞으로 밀어 비켜 세우고, 꼬리는 그 자리에서 장애물 위로 드리운다
    (꼬리까지 통째로 밀면 긴 꼬리가 배 쪽 셸에 걸려 리본 전체가 몸에서 떠 버린다)."""
    first = ribbon_bow(center, normal, up, **params)
    head = merge_meshes([first["knot"], first["wings"]])
    moved = translate_clear(head, np.array([0.0, 0.0, 1.0]), obstacles, gap)
    shift = moved.positions[0] - head.positions[0]
    thickness = float(params.get("thickness", 0.0016))

    def drape(points: np.ndarray) -> np.ndarray:
        out = points
        for surface, normals in obstacles:
            out = push_outside(out, surface, normals, gap + thickness)
        return out

    return ribbon_bow(center + shift, normal, up, drape=drape, **params)


def translate_clear(mesh: Mesh, direction: np.ndarray, obstacles: list[tuple[Surface, np.ndarray]], gap: float) -> Mesh:
    """조각 전체를 `direction` 쪽으로 평행 이동해 모든 정점이 장애물 표면들 바깥 `gap` 이상에 있게 한다(얇은 리본이 찌그러지지 않게 통째로 민다)."""
    direction = direction / np.linalg.norm(direction)
    need = 0.0
    for surface, normals in obstacles:
        hits = surface.closest(mesh.positions)
        corners = surface.triangles[np.maximum(hits.triangle, 0)]
        n = np.einsum("mc,mck->mk", hits.bary, normals[corners])
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        d = np.einsum("ij,ij->i", mesh.positions - hits.point, n)
        facing = n @ direction
        # 미는 방향을 마주 보는 면(앞면)만 센다 — 라펠 끝 옆벽·안쪽 면처럼 옆·뒤를 보는 면에서 나눗셈이 커져 리본이 몸에서 떠 버리던 결함
        valid = facing > 0.5
        if valid.any():
            need = max(need, float(np.max((gap - d[valid]) / facing[valid])))
    out = mesh.copy()
    if need > 0:
        out.positions = out.positions + direction * need
    return out


def placket_and_buttons(body: "BaseBody", shell: Mesh, y_top: float, y_bottom: float, width: float, count: int, radius: float, lift: float = 0.0014, x_center: float = 0.0, first_gap: float = 0.0) -> tuple[Mesh, Mesh, list[np.ndarray]]:
    """앞 가운데 세로 플래킷 띠(납작한 리본)와 그 위 단추 줄. (플래킷, 단추들, 단추 중심 목록)."""
    surface, normals_c = surface_frame_normals(shell)
    ys = np.linspace(y_top, y_bottom, 40)
    pts, ns = [], []
    for y in ys:
        hit = surface_point(surface, normals_c, np.array([x_center, y, 0.6]), np.array([0.0, 0.0, -1.0]))
        if hit is None:
            continue
        pts.append(hit[0])
        ns.append(hit[1])
    pts, ns = np.array(pts), np.array(ns)
    strip = ribbon(pts, ns, width, lift, base=0.0, sink=0.0014)
    buttons, centers = [], []
    ys_b = np.linspace(y_top - first_gap, y_bottom + 0.06, count)
    for y in ys_b:
        hit = surface_point(surface, normals_c, np.array([x_center, y, 0.6]), np.array([0.0, 0.0, -1.0]))
        if hit is None:
            continue
        c = hit[0] + hit[1] * (lift + 0.0002)
        buttons.append(button(c, hit[1], np.array([0.0, 1.0, 0.0]), radius, radius * 0.42))
        centers.append(c)
    return strip, merge_meshes(buttons) if buttons else Mesh(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)), centers


def button_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
    """단추: 가장자리 링 + 네 구멍(어두운 점)."""
    r = np.linalg.norm(uvw, axis=1)
    holes = np.zeros(len(r))
    for hx, hy in ((0.0017, 0.0017), (-0.0017, 0.0017), (0.0017, -0.0017), (-0.0017, -0.0017)):
        holes = np.maximum(holes, 1.0 - smoothstep(0.0006, 0.0009, np.hypot(uvw[:, 0] - hx, uvw[:, 1] - hy)))
    ring = line_profile(r, 0.0042, 0.0005)
    return 0.95 - 0.30 * holes - 0.10 * ring


def ribbon_bow(
    center: np.ndarray,
    normal: np.ndarray,
    up: np.ndarray,
    span: float = 0.034,
    wing_height: float = 0.024,
    depth: float = 0.009,
    tail_length: float = 0.052,
    tail_width: float = 0.016,
    thickness: float = 0.0016,
    drape: Callable[[np.ndarray], np.ndarray] | None = None,
) -> dict[str, Mesh]:
    """교복 리본 매듭: 가운데 매듭 + 좌우 날개(넓은 리본을 접은 고리 — 앞에서 보면 바깥으로 갈수록 넓어지고 끝이 살짝 처진다) +
    아래로 벌어지며 내려가는 꼬리 둘(끝은 V자 제비꼬리). `normal` 쪽(앞)을 본다. 부위별 메시({"knot", "wings", "tails"})를 돌려준다."""
    n = normal / np.linalg.norm(normal)
    side = np.cross(up, n)
    side /= np.linalg.norm(side)
    up2 = np.cross(n, side)
    knot = lathe(np.array([[0.0, -0.003], [0.0070, -0.003], [0.0084, 0.0015], [0.0078, 0.0055], [0.0045, 0.0074], [0.0, 0.0077]]), center, n, up2, 16)
    rel = knot.positions - center
    knot.positions = center + rel + np.outer(rel @ up2, up2) * 0.28  # 세로로 조금 길게
    wings = []
    for sgn in (1.0, -1.0):
        ts = np.linspace(0.0, 2.0 * np.pi, 28, endpoint=False)
        reach = 0.5 * (1.0 - np.cos(ts))  # 매듭 0 → 바깥 끝 1
        x = sgn * (0.0055 + span * reach)
        droop = -0.22 * span * reach
        zf = 0.5 * depth * np.sin(ts)
        path = center + np.outer(x, side) + np.outer(droop, up2) + np.outer(0.0035 + zf, n)
        w = wing_height * (0.42 + 0.58 * reach**0.8)
        band = ring_strip([path - up2 * (0.5 * w)[:, None], path + up2 * (0.5 * w)[:, None]], closed=True)
        a = center + side * (sgn * 0.0055) + n * 0.0035
        b = center + side * (sgn * (0.0055 + span)) + n * 0.0035 - up2 * (0.22 * span)

        def spine_out(c: np.ndarray, a=a, b=b) -> np.ndarray:
            ab = b - a
            t = np.clip(((c - a) @ ab) / float(ab @ ab), 0.0, 1.0)
            out = c - (a + np.outer(t, ab))
            return out - np.outer(out @ up2, up2)

        band.triangles = orient_like(band.positions, band.triangles, spine_out)
        wings.append(band)
    tails = []
    for sgn in (1.0, -1.0):
        ts = np.linspace(0.0, 1.0, 9)
        path = center[None, :] - np.outer(0.004 + tail_length * ts, up2) + np.outer(sgn * (0.003 + 0.020 * ts), side) + np.outer(0.0028 - 0.0016 * ts, n)
        tangent = np.gradient(path, axis=0)
        tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
        perp = np.cross(n, tangent)
        perp /= np.linalg.norm(perp, axis=1, keepdims=True)
        widths = tail_width * (0.70 + 0.30 * ts)
        cols = [path + perp * (k * 0.5 * widths)[:, None] for k in (-1.0, 0.0, 1.0)]
        grid = np.stack(cols, axis=1)  # (rows, 3, 3)
        grid[-1, 1] -= tangent[-1] * 0.009  # 제비꼬리(가운데를 위로 판다)
        if drape is not None:
            grid = drape(grid.reshape(-1, 3)).reshape(grid.shape)  # 꼬리는 칼라·셸 위로 드리운다
        gn = grid_normals(grid)
        flip = float(np.einsum("ijk,k->", gn, n)) < 0.0
        tails.append(solidify_grid(grid, thickness, flip=flip))
    return {"knot": knot, "wings": merge_meshes(wings), "tails": merge_meshes(tails)}


# ---------------------------------------------------------------- 상의 셸 공통 빌드


@dataclass
class TopSpec:
    """상의 셸 설계값."""

    name: str
    hem: Callable[[np.ndarray], np.ndarray]  # 몸통 축 각도 → 밑단 높이
    sleeve_length: float | None  # 어깨 관절에서 팔 방향 소매 끝까지(m), None = 민소매
    ease_torso: float
    ease_sleeve: tuple[float, float]  # (어깨 쪽, 소매 끝)
    neck: Any  # NeckSpec(표면 거리 목둘레) 또는 (몸, 위치) → 목둘레 장(음수 = 잘라 냄)
    neck_ease: float = 0.006
    shoulder_ease: float = 0.008
    hem_zone_d: float = 0.026
    drape_down: float = 0.45
    drape_side: float = 1.6
    target_triangles: int = 7600
    bands: dict[str, tuple[float, float]] = field(default_factory=dict)  # 가장자리 이름(hem|sleeve|neck) → (띠 폭, 띄움)
    folds: dict[str, tuple[float, float]] = field(default_factory=dict)  # 띠 없는 가장자리 → (두께, 시접 깊이)
    shape: Callable[["BaseBody", np.ndarray, np.ndarray], np.ndarray] | None = None
    layer_gap: float = 0.0  # 아우터: 아래 레이어 경계에서 띄울 간격(0이면 레이어 1)
    armhole: float = 0.0


CROTCH_HEM_CLEARANCE_M = 0.055  # 상의·아우터 밑단의 하한(가랑이 높이 위)


def make_top_shell(ctx: BuildContext, spec: TopSpec) -> tuple[Mesh, dict[str, Mesh], dict[str, list[np.ndarray]], dict[str, Any]]:
    """상의 셸을 만들고 가장자리(밑단·소매 끝·목둘레)를 자른 뒤 띠를 떼어 낸다. (본판, 가장자리별 띠, 가장자리별 고리, 정보)."""
    body = ctx.body
    lm = body.landmarks
    # 몸통 관 셸은 가랑이 바로 위에서 두 다리 사이로 말려 들어간다 — 밑단은 가랑이 + 5.5 cm 위에서만 자른다(남성은 엉덩이선이 가랑이에 가깝다)
    hem_floor = lm.crotch_y + CROTCH_HEM_CLEARANCE_M
    spec_hem = spec.hem
    spec = TopSpec(**{**spec.__dict__, "hem": lambda theta: np.maximum(spec_hem(theta), hem_floor)})
    hem_low = float(np.min(spec.hem(np.linspace(-np.pi, np.pi, 73))))
    sleeve = spec.sleeve_length
    sleeve_regions = ("upperArm.L", "upperArm.R") + (("forearm.L", "forearm.R") if sleeve is not None and sleeve > 0.27 else ())

    def ease(b: "BaseBody", p: np.ndarray, region: np.ndarray) -> np.ndarray:
        axial, _ = arm_axial(b, p)
        arm = np.isin(region, region_ids(b, *sleeve_regions)) if sleeve is not None else np.zeros(len(p), dtype=bool)
        e = np.full(len(p), spec.ease_torso)
        if sleeve is not None:
            e[arm] = spec.ease_sleeve[0] + (spec.ease_sleeve[1] - spec.ease_sleeve[0]) * smoothstep(0.04, sleeve, axial[arm])
        e[region == b.region_index("neck")] = spec.neck_ease
        top = (p[:, 1] > lm.armpit_y + 0.02) & (np.abs(p[:, 0]) > 0.07) & (np.abs(p[:, 0]) < 0.20)
        e[top] = np.minimum(e[top], spec.shoulder_ease)
        return e

    def d_lo(b: "BaseBody", p: np.ndarray, region: np.ndarray, e: np.ndarray) -> np.ndarray:
        lo = np.maximum(0.62 * e, 0.0072)
        zone = smoothstep(lm.waist_y - 0.04, lm.waist_y - 0.10, p[:, 1])
        torso = np.isin(region, region_ids(b, "torso", "pelvis"))
        return np.where(torso, np.maximum(lo, spec.hem_zone_d * zone), lo)

    def d_hi(b: "BaseBody", p: np.ndarray, region: np.ndarray, e: np.ndarray) -> np.ndarray:
        return top_d_hi(b, p, region, e)

    regions = ("torso", "pelvis", "neck") + (sleeve_regions if sleeve is not None else ())
    plan = ShellPlan(
        regions=regions,
        ease=ease,
        d_lo=d_lo,
        d_hi=d_hi,
        select=top_selection(hem_low, sleeve),
        iterations=30,
        drape={"kind": "torso", "down": spec.drape_down, "side": spec.drape_side, "top": lm.armpit_y - 0.02, "regions": ("torso", "pelvis")},
        target_triangles=spec.target_triangles,
        pin=armpit_pin(0.055),
        shape=spec.shape if spec.shape is not None else shoulder_line_fill(),
    )
    constraints = hem_zone_constraint(ctx, lm.waist_y - 0.02)
    if spec.layer_gap > 0.0:
        constraints = outer_constraints(ctx, y_max=lm.neck_back_y + 0.004)
    shell = build_body_shell(body, plan, constraints)
    frame = AxisFrame(body, "torso")

    def hem_values(points: np.ndarray) -> np.ndarray:
        _, _, theta, _ = frame.cyl(points)
        return points[:, 1] - spec.hem(theta)

    edges: dict[str, Callable[[np.ndarray], np.ndarray]] = {"hem": hem_values}
    if sleeve is not None:
        edges["sleeve"] = lambda pts: sleeve_field(body, pts, sleeve)
    else:
        edges["sleeve"] = lambda pts: armhole_field(body, pts)
    loops: dict[str, list[np.ndarray]] = {}
    for name, fn in edges.items():
        width = spec.bands.get(name, (0.0, 0.0))[0]
        shell, lp = cut_edge(shell, name, fn(shell.positions), (width,) if width > 0 else ())
        loops[name] = lp
    width = spec.bands.get("neck", (0.0, 0.0))[0]
    if isinstance(spec.neck, NeckSpec):
        shell, neck_values = geodesic_neck_field(body, shell, spec.neck)
    else:
        neck_values = spec.neck(body, shell.positions)
    shell, lp = cut_edge(shell, "neck", neck_values, (width,) if width > 0 else ())
    loops["neck"] = lp
    fb, arm = top_seam_fields(body, shell.positions, spec.armhole)
    shell = split_panels(shell, [fb, arm])
    shell.attrs["panel"] = panel_labels_from_fields(body, shell)
    bands: dict[str, Mesh] = {}
    main = shell
    for name, (width, lift) in spec.bands.items():
        normals = outward(welded_normals(main), main.positions, body)
        main, band = band_split(main, main.attrs[f"f_{name}"] / width, 1.0, lift, normals)
        bands[name] = finish_band_edges(band, body)
    for name, (thickness, depth) in spec.folds.items():
        normals = outward(welded_normals(main), main.positions, body)
        for loop in boundary_loops(main.triangles):
            if np.all(np.abs(main.attrs[f"f_{name}"][loop]) < 3e-4):
                main = add_fold(main, loop, normals, band_grad(main, loop), thickness, depth)
                normals = outward(welded_normals(main), main.positions, body)
    neck_loop_points = None
    for loop in boundary_loops(main.triangles):
        if np.all(np.abs(main.attrs["f_neck"][loop]) < 3e-4) and len(loop) > 10:
            neck_loop_points = main.positions[loop]
    info = {"hemLow": hem_low, "neckLoop": neck_loop_points}
    return main, bands, loops, info


def geodesic_distance(mesh: Mesh, sources: np.ndarray) -> np.ndarray:
    """메시 변 그래프 위 다익스트라 최단 거리(m): `sources`(정점 마스크)에서 각 정점까지."""
    import heapq

    ptr, idx = vertex_neighbors(mesh.triangles, mesh.count)
    dist = np.full(mesh.count, np.inf)
    heap = []
    for v in np.flatnonzero(sources):
        dist[v] = 0.0
        heap.append((0.0, int(v)))
    heapq.heapify(heap)
    P = mesh.positions
    while heap:
        d, v = heapq.heappop(heap)
        if d > dist[v]:
            continue
        for u in idx[ptr[v] : ptr[v + 1]].tolist():
            nd = d + float(np.linalg.norm(P[u] - P[v]))
            if nd < dist[u]:
                dist[u] = nd
                heapq.heappush(heap, (nd, u))
    return dist


@dataclass
class NeckSpec:
    """목둘레: 셸 목 관 윗단(높이 `stub_top`로 깨끗이 자른 고리)에서 표면 거리 D(φ)인 등거리선. `v`가 있으면 앞은 V자(맨 아래 높이, 위 반폭)."""

    front: float
    side: float
    back: float
    stub_top: float = 0.018  # 목뒤 밑동 위로 이만큼에서 목 관을 먼저 자른다
    v: tuple[float, float] | None = None  # (V 맨 아래 높이 y, 목 옆 높이에서의 V 반폭)
    power: float = 2.0


def geodesic_neck_field(body: "BaseBody", mesh: Mesh, spec: NeckSpec) -> tuple[Mesh, np.ndarray]:
    """목 관을 `stub_top` 높이에서 먼저 자르고(깨끗한 고리), 그 고리에서의 표면 거리로 목둘레 장(음수 = 잘라 냄)을 만든다. (메시, 장)."""
    lm = body.landmarks
    y_top = lm.neck_back_y + spec.stub_top
    phi, rho = neck_polar(body, mesh.positions)
    stub = np.where(rho < 0.095, y_top - mesh.positions[:, 1], 1.0)
    mesh, loops = cut_edge(mesh, "stub", stub)
    if not loops:
        # 목 관이 그 높이까지 없으면 기존 윗단 고리(목 근처 열린 가장자리)를 출발선으로 쓴다
        loops = [loop for loop in boundary_loops(mesh.triangles) if np.mean(neck_polar(body, mesh.positions[loop])[1] < 0.095) > 0.8 and mesh.positions[loop, 1].mean() > lm.neck_front_y]
    sources = np.zeros(mesh.count, dtype=bool)
    for loop in loops:
        sources[loop] = True
    if not sources.any():
        raise RuntimeError("목 관 윗단 고리를 만들지 못했다")
    dist = geodesic_distance(mesh, sources)
    phi, _ = neck_polar(body, mesh.positions)
    depth = front_back_blend(phi, spec.front, spec.side, spec.back, spec.power)
    field = dist - depth
    if spec.v is not None:
        bottom_y, half_width = spec.v
        side_y = lm.neck_front_y + 0.03
        slope = half_width / max(side_y - bottom_y, 1e-6)
        v_dist = (np.abs(mesh.positions[:, 0]) - slope * (mesh.positions[:, 1] - bottom_y)) / math.sqrt(1.0 + slope * slope)
        front = (mesh.positions[:, 2] - body.side_seam_z(mesh.positions[:, 1])) > 0.0
        v_dist = np.where(front & (mesh.positions[:, 1] > bottom_y - 0.03), v_dist, 1.0)
        field = np.minimum(field, v_dist)
    return mesh, field


def armhole_field(body: "BaseBody", points: np.ndarray, inset: float = 0.034, drop: float = 0.035, round_k: float = 0.022) -> np.ndarray:
    """민소매 진동둘레: 어깨 관절 평면보다 몸통 쪽으로 `inset` 들어간 곳 너머(팔 쪽)이면서 겨드랑이 아래 `drop`보다 높은 곳이 음수.

    두 조건(팔 쪽 평면 · 진동 밑 높이)을 부드러운 최댓값(모서리 반지름 ≈ `round_k`)으로 묶어 진동 밑이 둥근 U자가 된다.
    """
    axial, _ = arm_axial(body, points)
    a = -inset - axial
    b = (body.landmarks.armpit_y - drop) - points[:, 1]
    field = 0.5 * (a + b + np.sqrt((a - b) ** 2 + round_k**2))
    field[np.abs(points[:, 0]) < 0.08] = 1.0
    return field


def bottoms_waist_floor(body: "BaseBody") -> float:
    """하의 5종의 앞 허리선 가운데 가장 낮은 값 — 상의 밑단은 이보다 `TOP_BOTTOM_OVERLAP_M`(2.2 cm) 이상 낮아야 한다(겹침 규약).

    청바지·반바지(엉덩이 + 10.5/11 cm), 슬랙스(+ 11.5/12 cm), 치마(허리 − 5/7.5 cm) 모두 속옷 윗선 + 1.6 cm 이상으로 올린 값으로 잰다.
    """
    lm = body.landmarks
    female = body.base_id == "female"
    candidates = [
        lm.hip_y + (0.105 if female else 0.110),
        lm.hip_y + (0.115 if female else 0.120),
        lm.waist_y - (0.050 if female else 0.075),
    ]
    return min(effective_waist(body, front, front + 0.03)[0] for front in candidates)


TOP_BOTTOM_OVERLAP_M = 0.022


def shirt_hem(body: "BaseBody", front: float, side_raise: float) -> Callable[[np.ndarray], np.ndarray]:
    limit = bottoms_waist_floor(body) - TOP_BOTTOM_OVERLAP_M

    def hem(theta: np.ndarray) -> np.ndarray:
        return np.minimum(front + side_raise * np.abs(np.sin(theta)) ** 1.6, limit)

    return hem


def flat_hem(body: "BaseBody", y: float) -> Callable[[np.ndarray], np.ndarray]:
    limit = bottoms_waist_floor(body) - TOP_BOTTOM_OVERLAP_M

    def hem(theta: np.ndarray) -> np.ndarray:
        return np.full(len(theta), min(y, limit))

    return hem


# ---------------------------------------------------------------- 셔츠


def build_shirt(ctx: BuildContext) -> GarmentPlan:
    """셔츠(교복 블라우스·드레스 셔츠): 뾰족한 칼라(스탠드 + 날개, 트림), 앞 플래킷 + 단추 6(트림), 배럴 커프스(트림, 단추), 셔츠테일 곡선 밑단,
    등 요크·어깨·옆·진동·소매 밑 솔기, 여성은 칼라 리본(액센트)·남성은 넥타이(액센트)와 왼쪽 가슴 주머니. 형태 키: 기장·품·소매·칼라."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    shoulder = body.joint("LeftArm")
    wrist = body.joint("LeftHand")
    sleeve_len = float(np.linalg.norm(wrist - shoulder)) - 0.012
    spec = TopSpec(
        name="shirt",
        hem=shirt_hem(body, lm.hip_y + 0.005, 0.040),
        sleeve_length=sleeve_len,
        ease_torso=0.013 if female else 0.015,
        ease_sleeve=(0.009, 0.013),
        neck=NeckSpec(front=0.034, side=0.006, back=0.010),
        neck_ease=0.005,
        drape_down=0.55 if female else 0.32,
        hem_zone_d=0.019,
        bands={"sleeve": (0.060, 0.0024)},
        folds={"hem": (0.0026, 0.012)},
        target_triangles=7200,
    )
    main, bands, loops, info = make_top_shell(ctx, spec)
    if info["neckLoop"] is None:
        raise RuntimeError("셔츠 목둘레 고리를 찾지 못했다")
    pieces: list[Piece] = []
    seams_fn = lambda points: top_seam_paint(body, points, 0.955)  # noqa: E731
    yoke_y = lm.armpit_y + 0.035

    def main_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        base = seams_fn(points)
        back = points[:, 2] < body.side_seam_z(points[:, 1])
        yoke = line_profile(points[:, 1] - (yoke_y - 0.012 * np.cos(points[:, 0] / 0.18 * np.pi / 2) ** 2), 0.0, 0.0006) * back * (np.abs(points[:, 0]) < 0.17)
        return base - 0.14 * yoke

    pieces.append(Piece("body", main, role="main", attach="body", uv="unwrap", paint=main_paint, value=0.955, smooth_group="shell", normal_smooth=22))
    cuff = bands["sleeve"]

    def cuff_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        axial, _ = arm_axial(body, points)
        along = points[:, 1] + points[:, 2]
        st = stitch_line(axial, sleeve_len - 0.004, along) + stitch_line(axial, sleeve_len - 0.056, along)
        return 0.95 - 0.10 * np.clip(st, 0, 1)

    pieces.append(Piece("cuffs", cuff, role="trim", attach="carrier", uv="unwrap", paint=cuff_paint, value=0.95, compat_value=0.93))
    # 칼라(남성은 넥타이를 먼저 만들어 칼라 끝이 그 위에 얹히게 한다)
    collar_spec = CollarSpec()
    collar, cinfo = shirt_collar(body, main, info["neckLoop"], collar_spec)
    front_top = float(info["neckLoop"][np.argmax(info["neckLoop"][:, 2]), 1])
    hem_front = float(spec.hem(np.array([0.0]))[0])
    main_out = outward(welded_normals(main), main.positions, body)
    accent: list[tuple[str, Mesh]] = []
    if female:
        obstacles = [(Surface(collar.positions, collar.triangles), collar.attrs["normal"]), (Surface(main.positions, main.triangles), main_out)]
        bow = place_bow(cinfo["front_mid"] + np.array([0.0, -0.002, 0.007]), np.array([0.0, 0.05, 1.0]), np.array([0.0, 1.0, 0.0]), obstacles, span=0.029, wing_height=0.021, tail_length=0.046, tail_width=0.014)
        for part in ("wings", "tails", "knot"):
            accent.append((part, bow[part]))
    else:
        tie = necktie(body, main, cinfo["front_mid"] + np.array([0.0, -0.004, 0.0]), hem_front + 0.12)
        accent.append(("necktie", tie))
        collar, cinfo = shirt_collar(body, main, info["neckLoop"], collar_spec, obstacles=[tie])
    collar_edge = PolylineField(densify(cinfo["outer_edge"], 0.0015))

    def collar_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        d = collar_edge.distance(points)
        st = stitch_line(d, 0.0048, uvw[:, 0], 0.00045, 0.0032)
        return 0.955 - 0.10 * np.clip(st, 0, 1) + 0.006 * hash_noise(points, 0.003, seed=41)

    pieces.append(Piece("collar", collar, role="trim", attach="body", uv="grid", paint=collar_paint, value=0.955, compat_value=0.97))
    # 플래킷 + 단추
    placket, buttons, centers = placket_and_buttons(body, main, front_top - 0.004, hem_front + 0.004, 0.028, 6, 0.0052, first_gap=0.014)
    pieces.append(Piece("placket", placket, role="main", attach="carrier", uv="grid", paint=lambda p, u, v: 0.955 - 0.10 * np.clip(stitch_line(np.abs(u[:, 1] - 0.0014 - 0.0014 - 0.014), 0.0105, u[:, 0]), 0, 1), value=0.955))
    cuff_buttons = []
    surface_c, normals_cc = surface_frame_normals(cuff)
    for sign in (1.0, -1.0):
        frame = AxisFrame(body, "arm", sign)
        target = frame.origin + frame.axis * (sleeve_len - 0.030)
        hit = surface_point(surface_c, normals_cc, target - frame.e2 * sign * 0.0 + np.array([0.0, 0.0, -0.3]), np.array([0.0, 0.0, 1.0]))
        if hit is not None:
            cuff_buttons.append(button(hit[0] + hit[1] * 0.0004, hit[1], frame.axis, 0.0050, 0.0021))
    pieces.append(Piece("buttons", merge_meshes([buttons] + cuff_buttons), role="trim", attach="carrier", uv="grid", paint=button_paint, value=0.95, compat_value=0.90))
    # 가슴 주머니(남성)
    if not female:
        surface, normals_c = surface_frame_normals(main)
        cx = 0.085
        top = lm.bust_y + 0.05
        poly = np.array([[cx - 0.050, top], [cx + 0.050, top], [cx + 0.050, top - 0.105], [cx, top - 0.120], [cx - 0.050, top - 0.105]])
        pocket = surface_patch(surface, normals_c, FRONT, poly, 0.0006, 0.0012, bevel=0.0018, grid=0.007)

        def pocket_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
            d = polygon_distance(uvw, poly)
            return 0.955 - 0.12 * np.clip(stitch_line(d, 0.004, uvw[:, 0] + uvw[:, 1]) + line_profile(uvw[:, 1], top - 0.022, 0.0005) * (d > 0.002), 0, 1)

        pieces.append(Piece("pocket", pocket, role="main", attach="carrier", uv="grid", paint=pocket_paint, value=0.955))
    # 액센트: 여성 리본 / 남성 넥타이
    accent_paint = lambda p, u, v: 0.95 + 0.006 * hash_noise(p, 0.003)  # noqa: E731
    for part, mesh in accent:
        pieces.append(Piece(f"tie.{part}", mesh, role="accent", attach="carrier", uv="grid", paint=accent_paint, value=0.95, compat_value=0.55, ao_strength=0.3))
    keys = [
        length_key(lm.waist_y + 0.02, hem_front, 0.07, 0.06),
        looseness_key(0.010, 0.005),
        sleeve_key(sleeve_len, 0.02, 0.16, start=0.06),
        collar_leaf_key(0.25, 0.22),
    ]
    return GarmentPlan("top", "shirt", 1, pieces, keys, hem_zone_constraint(ctx, lm.waist_y - 0.02), {"sleeveLength": sleeve_len})


def necktie(body: "BaseBody", shell: Mesh, knot_center: np.ndarray, y_tip: float) -> Mesh:
    """넥타이: 칼라 앞 가운데의 매듭(위가 넓은 사다리꼴 덩어리) + 셔츠 앞 가운데를 따라 내려가며 넓어지는 블레이드(끝은 뾰족)."""
    surface, normals_c = surface_frame_normals(shell)
    hit = surface_point(surface, normals_c, np.array([0.0, knot_center[1], 0.6]), np.array([0.0, 0.0, -1.0]))
    knot_z = max(float(knot_center[2]), float(hit[0][2]) if hit is not None else float(knot_center[2])) + 0.006
    center = np.array([0.0, float(knot_center[1]), knot_z])
    ys = np.linspace(center[1] - 0.010, y_tip, 24)
    pts, ns = [], []
    for y in ys:
        h = surface_point(surface, normals_c, np.array([0.0, y, 0.6]), np.array([0.0, 0.0, -1.0]))
        if h is not None:
            pts.append(h[0] + h[1] * 0.0040)
            ns.append(h[1])
    pts, ns = np.array(pts), np.array(ns)
    # 매듭 바로 아래는 매듭 앞쪽에서 셸 쪽으로 내려앉는다
    settle = smoothstep(0.0, 0.035, center[1] - pts[:, 1])
    pts[:, 2] = np.maximum(pts[:, 2], center[2] - 0.004) * (1.0 - settle) + pts[:, 2] * settle
    widths = np.linspace(0.030, 0.070, len(pts)) * np.r_[np.ones(len(pts) - 2), 0.6, 0.12]
    blade = variable_ribbon(pts, ns, widths, 0.0026)
    knot = lathe(np.array([[0.0, -0.005], [0.0150, -0.005], [0.0172, 0.002], [0.0140, 0.0075], [0.0, 0.0085]]), center, np.array([0.0, 0.05, 1.0]), np.array([0.0, 1.0, 0.0]), 12)
    rel = knot.positions - center
    taper = 0.75 + 0.25 * np.clip(rel[:, 1] / 0.012 + 0.5, 0.0, 1.0)  # 위가 넓은 사다리꼴
    knot.positions = center + rel * np.stack([taper, np.ones(len(rel)) * 1.15, np.ones(len(rel))], axis=1)
    return merge_meshes([blade, knot])


def variable_ribbon(curve: np.ndarray, normals: np.ndarray, widths: np.ndarray, height: float) -> Mesh:
    """폭이 점마다 다른 납작한 띠(넥타이 블레이드)."""
    n = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    tangent = np.gradient(curve, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-12)
    side = np.cross(n, tangent)
    side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-12)
    half = 0.5 * widths[:, None]
    rings = [curve + side * half - n * 0.0005, curve + side * half + n * height, curve - side * half + n * height, curve - side * half - n * 0.0005]
    mesh = ring_strip(rings, closed=False, uv_v=[0.0, height, height + float(widths.max()), 2 * height + float(widths.max())])
    center = curve + n * (0.5 * height)
    ref = np.tile(center, (4, 1))
    mesh.triangles = orient_like(mesh.positions, mesh.triangles, lambda c: c - ref[np.argmin(((c[:, None, :] - ref[None, :, :]) ** 2).sum(axis=2), axis=1)])
    return mesh


# ---------------------------------------------------------------- 세일러복


def project_view(surface: Surface, normals: np.ndarray, frame: ProjectionFrame, points_2d: np.ndarray, body: "BaseBody") -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """틀(정면·후면)에서 본 2D 점들을 표면에 투영한다. (표면점, 바깥 법선, 맞았는지)."""
    origins = frame.to_world(np.asarray(points_2d, dtype=np.float64))
    directions = np.tile(frame.w, (len(origins), 1))
    hits, tri = surface.ray(origins, directions, 1.4)
    corners = surface.triangles[np.maximum(tri, 0)]
    bary = np.clip(barycentric(hits, surface.positions[corners[:, 0]], surface.positions[corners[:, 1]], surface.positions[corners[:, 2]]), 0.0, 1.0)
    bary /= np.maximum(bary.sum(axis=1, keepdims=True), 1e-12)
    n = np.einsum("mc,mck->mk", bary, normals[corners])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return hits, outward(n, hits, body), tri >= 0


def section_curve(surface: Surface, x: float, center: np.ndarray, a0: float, a1: float, count: int) -> np.ndarray:
    """평면 x = `x`에서 안쪽 점 `center`로부터 각도 a(+z에서 +y 쪽으로 잰 각)마다 바깥으로 쏜 광선이 처음 닿는 표면점(어깨 단면)."""
    angles = np.linspace(a0, a1, count)
    directions = np.stack([np.zeros(count), np.sin(angles), np.cos(angles)], axis=1)
    origins = np.tile(np.array([x, center[1], center[2]]), (count, 1))
    hits, tri = surface.ray(origins, directions, 0.5)
    return hits[tri >= 0]


def resample_polyline(points: np.ndarray, count: int) -> np.ndarray:
    """점 열을 호길이로 고르게 `count`개로 다시 뽑는다."""
    arc = loop_arclength(points, closed=False)
    query = np.linspace(0.0, arc[-1], count)
    return np.stack([np.interp(query, arc, points[:, k]) for k in range(3)], axis=1)


def arc_param_points(points: np.ndarray, fractions: np.ndarray) -> np.ndarray:
    """점 열 위에서 호길이 비율(0..1) 위치의 점들."""
    arc = loop_arclength(points, closed=False)
    query = np.clip(fractions, 0.0, 1.0) * arc[-1]
    return np.stack([np.interp(query, arc, points[:, k]) for k in range(3)], axis=1)


@dataclass
class SailorCollarSpec:
    """세일러 칼라 설계값(m). 뒤는 네모난 판, 어깨를 넘어 앞에서 V 맨 아래로 가늘어지는 라펠."""

    shoulder_frac: float = 0.74  # 목 옆 → 어깨 관절 사이에서 칼라 바깥 가장자리가 어깨를 넘는 위치
    back_drop: float = 0.165  # 목 뒤 밑동에서 뒤 칼라 아랫단까지
    corner_radius: float = 0.012
    shoulder_drop: float = 0.026  # 어깨 윗면 높이에서 앞·뒤 모서리까지 내려온 높이
    tip_width: float = 0.007
    tuck: float = 0.004  # 안쪽 가장자리가 셸 목둘레를 덮고 목 쪽으로 넘어간 길이
    lift: float = 0.0016
    thickness: float = 0.0022
    rows: tuple[float, ...] = (0.0, 0.14, 0.30, 0.47, 0.63, 0.77, 0.88, 0.95, 1.0)
    columns: tuple[int, int, int] = (13, 6, 15)  # 반쪽 구간별 열 수: 라펠 · 어깨 · 뒤
    stripes: tuple[float, ...] = (0.011, 0.020)  # 바깥 가장자리에서 줄무늬 중심까지
    stripe_width: float = 0.0036
    stripe_height: float = 0.0009


def sailor_collar(body: "BaseBody", shell: Mesh, neck_loop: np.ndarray, v_bottom: float, spec: SailorCollarSpec) -> tuple[Mesh, Mesh, dict[str, Any]]:
    """세일러 칼라 판(두께, 트림)과 가장자리를 따라가는 줄무늬 두 줄(본체색)을 만든다. (칼라, 줄무늬, 정보).

    바깥 가장자리는 정면에서 그린 라펠 선(V 맨 아래 → 어깨 앞 모서리), 어깨 단면(x = 어깨 위치 평면), 후면에서 그린 네모 판(어깨 뒤 모서리 → 둥근 귀퉁이 →
    뒤 가운데)을 셸에 투영해 잇는다. 목둘레의 열쇠점(V 맨 아래·목 옆 앞·목 옆 뒤·뒤 가운데)과 가장자리의 열쇠점을 구간마다 호길이 비율로 짝지어 열을 만든다.
    """
    lm = body.landmarks
    surface, normals_c = surface_frame_normals(shell)
    shell_out = outward(normals_c, shell.positions, body)
    phi, _ = neck_polar(body, neck_loop)
    left = neck_loop[neck_loop[:, 0] >= -1e-6]
    left_phi = phi[neck_loop[:, 0] >= -1e-6]
    neck = left[np.argsort(left_phi)]
    neck_phi = np.sort(left_phi)
    neck = np.concatenate([[np.array([0.0, neck[0, 1], neck[0, 2]])], neck, [np.array([0.0, neck[-1, 1], neck[-1, 2]])]])
    neck_phi = np.concatenate([[0.0], neck_phi, [np.pi]])
    neck_side_x = float(left[:, 0].max())
    shoulder_x = float(body.joint("LeftArm")[0])
    x_s = neck_side_x + spec.shoulder_frac * (shoulder_x - neck_side_x)
    # 어깨 높이: x_s 단면 위쪽 최고점
    top = section_curve(surface, x_s, np.array([x_s, lm.armpit_y, float(body.torso_center_z(np.array([lm.armpit_y]))[0])]), 0.2, np.pi - 0.2, 60)
    y_top = float(top[:, 1].max())
    y_corner = y_top - spec.shoulder_drop
    # (1) 라펠: 정면에서 V 맨 아래 → 어깨 앞 모서리
    lapel_2d = np.stack([np.linspace(spec.tip_width, x_s, 40), np.linspace(v_bottom - 0.004, y_corner, 40)], axis=1)
    lapel, _, ok_l = project_view(surface, normals_c, FRONT, lapel_2d, body)
    lapel = lapel[ok_l]
    # (3) 뒤: 후면에서 어깨 뒤 모서리 → 둥근 귀퉁이 → 뒤 가운데(BACK 틀의 a = −x)
    y_b = lm.neck_back_y - spec.back_drop
    r = spec.corner_radius
    side = np.stack([np.full(30, x_s), np.linspace(y_corner, y_b + r, 30)], axis=1)
    arc = np.array([[x_s - r + r * math.cos(a), y_b + r - r * math.sin(a)] for a in np.linspace(0.0, np.pi / 2, 8)[1:]])
    bottom = np.stack([np.linspace(x_s - r, 0.0, 30)[1:], np.full(29, y_b)], axis=1)
    back_2d = np.concatenate([side, arc, bottom])
    back, _, ok_b = project_view(surface, normals_c, BACK, back_2d * np.array([-1.0, 1.0]), body)
    back = back[ok_b]
    # (2) 어깨 단면: 앞 모서리 → 뒤 모서리(평면 x = x_s, 안쪽 점에서 바깥으로)
    center = np.array([x_s, y_corner - 0.05, float(body.torso_center_z(np.array([y_corner]))[0])])
    a_f = math.atan2(lapel[-1, 1] - center[1], lapel[-1, 2] - center[2])
    a_b = math.atan2(back[0, 1] - center[1], back[0, 2] - center[2])
    if a_b < a_f:
        a_b += 2.0 * np.pi
    shoulder = section_curve(surface, x_s, center, a_f, a_b, 24)
    # 열쇠점 짝: 목둘레(V 맨 아래 · φ 1.15 · φ 1.95 · π) ↔ 가장자리(라펠 끝 · 앞 모서리 · 뒤 모서리 · 뒤 가운데)
    neck_keys = [0.0, 1.15, 1.95, np.pi]
    outline_parts = [lapel, shoulder, back]
    cols: list[np.ndarray] = []
    outer: list[np.ndarray] = []
    for seg, count in enumerate(spec.columns):
        t = np.linspace(0.0, 1.0, count + 1)[:-1] if seg < len(spec.columns) - 1 else np.linspace(0.0, 1.0, count)
        sel = (neck_phi >= neck_keys[seg] - 1e-9) & (neck_phi <= neck_keys[seg + 1] + 1e-9)
        seg_neck = neck[sel]
        if len(seg_neck) < 2:
            seg_neck = sample_loop(neck_phi, neck, np.array([neck_keys[seg], neck_keys[seg + 1]]))
        cols.append(arc_param_points(seg_neck, t))
        outer.append(arc_param_points(outline_parts[seg], t))
    inner_pts = np.concatenate(cols)
    outer_pts = np.concatenate(outer)
    # 행: 목둘레(목 쪽으로 `tuck` 넘어감) → 셸에 붙은 판 → 바깥 가장자리
    span = outer_pts - inner_pts
    span_dir = span / np.maximum(np.linalg.norm(span, axis=1, keepdims=True), 1e-12)
    _, n_inner = shell_normal_at(surface, normals_c, inner_pts, body)
    rows = []
    for v in spec.rows:
        if v == 0.0:
            tuck_row = inner_pts - span_dir * spec.tuck + n_inner * (spec.lift + spec.thickness)
            # 목 쪽으로 넘어간 안쪽 가장자리는 몸에서 두께 + 3 mm 이상 떨어지게(목이 굵은 베이스에서 안쪽 면이 목에 닿지 않게)
            d, normal = body.signed_distance(tuck_row)
            tuck_row = tuck_row + np.maximum(spec.thickness + 0.003 - d, 0.0)[:, None] * normal
            rows.append(tuck_row)
            continue
        p = inner_pts + span * v
        hit, n = shell_normal_at(surface, normals_c, p, body)
        rows.append(hit + n * (spec.lift + spec.thickness))
    half = np.stack(rows)  # (R, C, 3) 왼쪽 반: V 맨 아래(열 0) → 뒤 가운데
    for _ in range(2):
        flat = push_outside(half[1:].reshape(-1, 3), surface, shell_out, spec.lift + spec.thickness)
        half[1:] = flat.reshape(half[1:].shape)
    mirror = half.copy()
    mirror[:, :, 0] *= -1.0
    full = np.concatenate([mirror, half[:, ::-1][:, 1:]], axis=1)  # 오른쪽 V → 뒤 → 왼쪽 V
    v_attr = np.repeat(np.asarray(spec.rows, dtype=np.float64)[:, None], full.shape[1], axis=1)
    span_full = np.concatenate([span * np.array([-1.0, 1.0, 1.0]), span[::-1][1:]])
    gn = grid_normals(full)
    _, n_ref = shell_normal_at(surface, normals_c, full[len(spec.rows) // 2], body)
    flip = float(np.einsum("ij,ij->", gn[len(spec.rows) // 2], n_ref)) < 0.0
    attrs = {"leaf": v_attr, "leaf_dx": v_attr * 0 + span_full[None, :, 0], "leaf_dy": v_attr * 0 + span_full[None, :, 1], "leaf_dz": v_attr * 0 + span_full[None, :, 2]}
    collar = solidify_grid(full, spec.thickness, flip=flip, attrs=attrs)
    # 줄무늬: 열마다 바깥 가장자리에서 안쪽으로 d(좁은 라펠 끝에서는 폭 비율로 줄어든다)만큼 들어간 점
    outer_normals = gn * (-1.0 if flip else 1.0)
    stripes = []
    widths = np.linalg.norm(np.diff(full, axis=0), axis=2).sum(axis=0)
    v_rows = np.asarray(spec.rows, dtype=np.float64)[::-1]
    for k, d in enumerate(spec.stripes):
        frac = (0.27, 0.46)[min(k, 1)]
        curve, ns, vs = [], [], []
        for c in range(full.shape[1]):
            column = full[::-1, c]
            arc_c = loop_arclength(column, closed=False)
            dd = min(d, frac * widths[c])
            curve.append(np.stack([np.interp(dd, arc_c, column[:, m]) for m in range(3)]))
            ncol = outer_normals[::-1, c]
            nn = np.stack([np.interp(dd, arc_c, ncol[:, m]) for m in range(3)])
            ns.append(nn / max(np.linalg.norm(nn), 1e-12))
            vs.append(float(np.interp(dd, arc_c, v_rows)))
        stripe = ribbon(np.array(curve), np.array(ns), spec.stripe_width, spec.stripe_height, base=0.0, sink=0.0006)
        # 칼라 크기 키가 줄무늬도 함께 옮기게 칼라와 같은 날개 속성을 준다(띠 정점 = 곡선 점 × 4 고리)
        stripe.attrs["leaf"] = np.tile(np.array(vs), 4)
        for m, key in enumerate(("leaf_dx", "leaf_dy", "leaf_dz")):
            stripe.attrs[key] = np.tile(span_full[:, m], 4)
        stripes.append(stripe)
    info = {"x_s": x_s, "y_back_bottom": y_b, "y_corner": y_corner, "outer_edge": full[-1].copy(), "inner_edge": full[0].copy()}
    return collar, merge_meshes(stripes), info


def arm_ring_ribbons(body: "BaseBody", carrier: Mesh, axials: list[float], width: float, height: float, segments: int = 40) -> Mesh:
    """소매(커프스) 둘레 줄무늬: 팔 축 거리 `axials`마다 바깥에서 축으로 쏜 광선이 닿는 운반 표면 위 닫힌 띠."""
    surface, normals_c = surface_frame_normals(carrier)
    rings = []
    for sign in (1.0, -1.0):
        frame = AxisFrame(body, "arm", sign)
        for t in axials:
            angles = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
            radial = np.outer(np.cos(angles), frame.e1) + np.outer(np.sin(angles), frame.e2)
            axis_point = frame.origin + frame.axis * t
            origins = axis_point + radial * 0.25
            hits, tri = surface.ray(origins, -radial, 0.25)
            if (tri < 0).any():
                continue
            corners = surface.triangles[tri]
            bary = np.clip(barycentric(hits, surface.positions[corners[:, 0]], surface.positions[corners[:, 1]], surface.positions[corners[:, 2]]), 0, 1)
            bary /= bary.sum(axis=1, keepdims=True)
            n = np.einsum("mc,mck->mk", bary, normals_c[corners])
            n /= np.linalg.norm(n, axis=1, keepdims=True)
            n = np.where((n * radial).sum(axis=1)[:, None] < 0, -n, n)
            rings.append(ribbon(hits, n, width, height, closed=True, base=0.0, sink=0.0006))
    return merge_meshes(rings) if rings else Mesh(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64))


def build_sailor(ctx: BuildContext) -> GarmentPlan:
    """세일러복(교복 상의): V 목둘레 + 뒤가 네모난 세일러 칼라(트림)와 가장자리 줄무늬 두 줄(본체색 입체 띠), 가슴 가리개(트림, 가로줄),
    스카프 리본(액센트), 줄무늬 두 줄 커프스(트림), 접힌 밑단. 형태 키: 기장·품·소매·칼라."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    shoulder = body.joint("LeftArm")
    wrist = body.joint("LeftHand")
    sleeve_len = float(np.linalg.norm(wrist - shoulder)) - 0.012
    v_bottom = lm.bust_y + (0.040 if female else 0.055)
    spec = TopSpec(
        name="sailor",
        hem=flat_hem(body, lm.hip_y + 0.012),
        sleeve_length=sleeve_len,
        ease_torso=0.015 if female else 0.017,
        ease_sleeve=(0.010, 0.014),
        neck=NeckSpec(front=0.030, side=0.007, back=0.012, v=(v_bottom, 0.058 if female else 0.062)),
        neck_ease=0.005,
        drape_down=0.50 if female else 0.32,
        hem_zone_d=0.019,
        bands={"sleeve": (0.052, 0.0024)},
        folds={"hem": (0.0026, 0.012)},
        target_triangles=6800,
    )
    main, bands, loops, info = make_top_shell(ctx, spec)
    if info["neckLoop"] is None:
        raise RuntimeError("세일러 목둘레 고리를 찾지 못했다")
    pieces: list[Piece] = []

    def main_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        return top_seam_paint(body, points, 0.955)

    pieces.append(Piece("body", main, role="main", attach="body", uv="unwrap", paint=main_paint, value=0.955, smooth_group="shell", normal_smooth=22))
    cuff = bands["sleeve"]
    pieces.append(Piece("cuffs", cuff, role="trim", attach="carrier", uv="unwrap", paint=lambda p, u, v: 0.93 + 0.006 * hash_noise(p, 0.003), value=0.93, compat_value=0.78))
    cuff_stripes = arm_ring_ribbons(body, cuff, [sleeve_len - 0.013, sleeve_len - 0.025], 0.0034, 0.0009, segments=28)
    pieces.append(Piece("cuff_stripes", cuff_stripes, role="main", attach="carrier", uv="grid", paint=lambda p, u, v: np.full(len(p), 0.97), value=0.97, compat_value=0.99))
    collar_spec = SailorCollarSpec(back_drop=0.190 if female else 0.205)
    collar, stripes, cinfo = sailor_collar(body, main, info["neckLoop"], v_bottom, collar_spec)
    pieces.append(Piece("collar", collar, role="trim", attach="body", uv="grid", paint=lambda p, u, v: 0.93 + 0.006 * hash_noise(p, 0.003, seed=43), value=0.93, compat_value=0.74))
    pieces.append(Piece("collar_stripes", stripes, role="main", attach="carrier", uv="grid", paint=lambda p, u, v: np.full(len(p), 0.97), value=0.97, compat_value=0.99))
    # 가슴 가리개: V 안쪽(몸 표면 + 6 mm, 셸 아래로 숨는 가장자리), 위쪽 가로줄
    body_surface = Surface(body.P, body.T)
    panel_top = v_bottom + (0.080 if female else 0.085)
    half_v = (0.058 if female else 0.062) * (panel_top - v_bottom) / max(lm.neck_front_y + 0.03 - v_bottom, 1e-6)
    panel_poly = np.array([[-(half_v + 0.010), panel_top], [half_v + 0.010, panel_top], [0.016, v_bottom - 0.012], [-0.016, v_bottom - 0.012]])
    panel = surface_patch(body_surface, body.N, FRONT, panel_poly, 0.0068, 0.0012, bevel=0.002, grid=0.006, rim_depth=-0.0025)
    # 가리개는 V 가장자리 셸 면보다 4 mm 뒤의 면 아래로 파이지 않게 한다(가슴 사이 골을 따라 꺼지지 않는 평평한 판)
    loop = info["neckLoop"]
    vedge = loop[(loop[:, 2] > body.side_seam_z(loop[:, 1])) & (loop[:, 1] < lm.neck_front_y + 0.03)]
    if len(vedge) > 4:
        order = np.argsort(vedge[:, 1])
        floor_z = np.interp(panel.positions[:, 1], vedge[order, 1], vedge[order, 2]) - 0.004
        panel.positions[:, 2] = np.maximum(panel.positions[:, 2], floor_z)
    pieces.append(Piece("panel", panel, role="trim", attach="carrier", uv="grid", paint=lambda p, u, v: 0.93 + 0.006 * hash_noise(p, 0.003, seed=47), value=0.93, compat_value=0.74))
    panel_surface, panel_normals = surface_frame_normals(panel)
    line_y = panel_top - 0.014
    line_2d = np.stack([np.linspace(-half_v - 0.004, half_v + 0.004, 24), np.full(24, line_y)], axis=1)
    line_pts, line_n, ok = project_view(panel_surface, panel_normals, FRONT, line_2d, body)
    if ok.sum() > 4:
        pieces.append(Piece("panel_stripe", ribbon(line_pts[ok], line_n[ok], 0.0034, 0.0008, sink=0.0005), role="main", attach="carrier", uv="grid", paint=lambda p, u, v: np.full(len(p), 0.97), value=0.97, compat_value=0.99))
    # 스카프 리본: V 맨 아래, 칼라·가리개 앞
    knot = np.array([0.0, v_bottom + 0.008, 0.0])
    hit = surface_point(panel_surface, panel_normals, np.array([0.0, knot[1], 0.6]), np.array([0.0, 0.0, -1.0]))
    knot[2] = (hit[0][2] if hit is not None else lm.joints["mixamorig:Spine2"][2] + 0.1) + 0.010
    collar_out = collar.attrs["normal"]
    obstacles = [(Surface(collar.positions, collar.triangles), collar_out), (panel_surface, outward(panel_normals, panel.positions, body)), (Surface(main.positions, main.triangles), outward(welded_normals(main), main.positions, body))]
    bow = place_bow(knot, np.array([0.0, 0.10, 1.0]), np.array([0.0, 1.0, 0.0]), obstacles, span=0.046, wing_height=0.034, depth=0.013, tail_length=0.105, tail_width=0.026, thickness=0.0018)
    for part in ("wings", "tails", "knot"):
        pieces.append(Piece(f"scarf.{part}", bow[part], role="accent", attach="carrier", uv="grid", paint=lambda p, u, v: 0.95 + 0.006 * hash_noise(p, 0.003), value=0.95, compat_value=0.55, ao_strength=0.3))
    hem_y = float(spec.hem(np.array([0.0]))[0])
    keys = [
        length_key(lm.waist_y + 0.02, hem_y, 0.07, 0.06),
        looseness_key(0.010, 0.005),
        sleeve_key(sleeve_len, 0.02, 0.16, start=0.06),
        collar_leaf_key(0.18, 0.20),
    ]
    return GarmentPlan("top", "sailor", 1, pieces, keys, hem_zone_constraint(ctx, lm.waist_y - 0.02), {"sleeveLength": sleeve_len, "vBottom": v_bottom, **{k: v for k, v in cinfo.items() if not isinstance(v, np.ndarray)}})


# ---------------------------------------------------------------- 슬랙스·반바지(테일러드 하의 공통)


def twill_paint(base: float = 0.91, depth: float = 0.022) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
    """면 능직(치노): 월드 UV 고운 대각선 + 결 노이즈."""

    def paint(points: np.ndarray, uvw: np.ndarray) -> np.ndarray:
        diag = 0.5 + 0.5 * np.cos(2.0 * np.pi * (uvw[:, 0] + uvw[:, 1]) / 0.0019)
        return base - depth * diag + 0.010 * hash_noise(points, 0.004, seed=53)

    return paint


def build_tailored_pants(ctx: BuildContext, spec: PantsSpec, loops_angles: list[float], welt_width: float, keys: list[ShapeKey], crease_line: bool) -> GarmentPlan:
    """테일러드 하의(슬랙스·반바지): 허리띠(트림) + 벨트 고리(트림) + 앞 단추(트림) + 사선 옆주머니 입구선 + 뒤 입술 주머니 2 + J 스티치 지퍼 덮개,
    밑단은 접힌 단(슬랙스) 또는 접어 올린 커프스(반바지, 트림). `crease_line`이면 앞·뒤 칼주름 능선에 밝은 다림질 선을 굽는다."""
    body = ctx.body
    lm = body.landmarks
    main, band, cuff, info = build_pants(ctx, spec)
    surface, normals_c = surface_frame_normals(main)
    band_surface, band_normals = surface_frame_normals(band)
    paint = spec.paint or wool_paint()
    band_bottom_front = spec.waist_front - spec.band_width
    band_bottom_back = spec.waist_back - spec.band_width
    details: list[Piece] = [fly_piece(surface, normals_c, band_bottom_front, lm.crotch_y, paint, 0.90)]
    # 뒤 입술 주머니
    for k, (poly, patch) in enumerate(welt_pockets(surface, normals_c, band_bottom_back - 0.058, 0.074, welt_width)):

        def welt_paint(points: np.ndarray, uvw: np.ndarray, variant: str, poly=poly) -> np.ndarray:
            cy = float(poly[:, 1].mean())
            slit = line_profile(uvw[:, 1], cy, 0.0006)
            return paint(points, uvw) - 0.16 * slit - 0.08 * line_profile(polygon_distance(uvw, poly), 0.0, 0.0005)

        details.append(Piece(f"welt.{k}", patch, role="main", attach="carrier", uv="grid", paint=welt_paint, value=0.90))
    # 사선 옆주머니 입구(본판 무늬): 허리띠 아래 앞에서 옆선 쪽으로 내려가는 곧은 선
    slant_lines = []
    for sign in (1.0, -1.0):
        t = np.linspace(0.0, 1.0, 26)
        curve = torso_surface_curve(body, surface, normals_c, sign * (0.52 + 0.74 * t), band_bottom_front - 0.004 - 0.165 * t)
        if len(curve) > 4:
            slant_lines.append(densify(curve, 0.002))
    slant_field = PolylineField(np.concatenate(slant_lines)) if slant_lines else None
    # 뒤 다트(허리띠 아래 짧은 선)
    darts = []
    for sign in (1.0, -1.0):
        t = np.linspace(0.0, 1.0, 10)
        curve = torso_surface_curve(body, surface, normals_c, np.full(10, np.pi - sign * 0.62), band_bottom_back - 0.004 - 0.075 * t)
        if len(curve) > 3:
            darts.append(densify(curve, 0.002))
    dart_field = PolylineField(np.concatenate(darts)) if darts else None

    def main_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        base = paint(points, uvw)
        lr_v, fb_v = pants_panels(body, points)
        along = points[:, 1] + 0.3 * points[:, 0]
        below = points[:, 1] < lm.crotch_y + 0.02
        seam = line_profile(fb_v, 0.0, 0.0006) * (below | (np.abs(points[:, 0]) > 0.11))
        seam = np.maximum(seam, line_profile(lr_v, 0.0, 0.0006) * (points[:, 1] > lm.crotch_y - 0.02))
        stitch = np.zeros(len(points))
        if slant_field is not None:
            dp = slant_field.distance(points)
            seam = np.maximum(seam, line_profile(dp, 0.0, 0.0007))
            stitch = np.maximum(stitch, stitch_line(dp, 0.0055, along))
        if dart_field is not None:
            seam = np.maximum(seam, 0.7 * line_profile(dart_field.distance(points), 0.0, 0.0005))
        shade = base - 0.12 * seam + 0.10 * np.clip(stitch, 0, 1)
        if crease_line:
            for sign in (1.0, -1.0):
                frame = AxisFrame(body, "leg", sign)
                sel = (np.sign(points[:, 0]) == sign) & (points[:, 1] < lm.crotch_y - 0.02)
                if sel.any():
                    _, _, theta, _ = frame.cyl(points[sel])
                    d = np.minimum(np.abs(theta), np.abs(np.abs(theta) - np.pi))
                    fade = smoothstep(lm.crotch_y - 0.02, lm.crotch_y - 0.12, points[sel, 1])
                    shade[sel] += 0.035 * (1.0 - smoothstep(0.03, 0.09, d)) * fade
        return shade

    def band_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        _, _, theta, _ = AxisFrame(body, "torso").cyl(points)
        top = waist_line_y(spec, theta, body)
        st = stitch_line(top - points[:, 1], 0.0040, theta * 0.15) + stitch_line(top - points[:, 1], spec.band_width - 0.0040, theta * 0.15)
        return paint(points, uvw) + 0.10 * np.clip(st, 0, 1)

    loops_mesh = merge_meshes([belt_loops(band, body, [phi], float(waist_line_y(spec, np.array([phi]), body)[0]) - spec.band_width - 0.004, float(waist_line_y(spec, np.array([phi]), body)[0]) - 0.0015) for phi in loops_angles])
    hardware = []
    hit = surface_point(band_surface, band_normals, np.array([0.0, spec.waist_front - spec.band_width / 2, 0.6]), np.array([0.0, 0.0, -1.0]))
    if hit is not None:
        hardware.append(button(hit[0] + hit[1] * 0.0006, hit[1], np.array([0.0, 1.0, 0.0]), 0.0068, 0.0028, segments=16))
    pieces = [
        Piece("body", main, role="main", attach="body", uv="unwrap", paint=main_paint, value=0.90, smooth_group="shell", normal_smooth=8),
        Piece("waistband", band, role="trim", attach="body", uv="unwrap", paint=band_paint, value=0.90, compat_value=0.80),
        Piece("belt_loops", loops_mesh, role="trim", attach="carrier", uv="grid", paint=lambda p_, u, v: paint(p_, u), value=0.90, compat_value=0.80),
        Piece("buttons", merge_meshes(hardware), role="trim", attach="carrier", uv="grid", paint=button_paint, value=0.95, compat_value=0.85),
    ] + details
    if cuff is not None:

        def cuff_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
            along = np.arctan2(points[:, 0], points[:, 2]) * 0.1
            st = stitch_line(points[:, 1] - spec.hem_y, spec.cuff - 0.005, along)
            return paint(points, uvw) + 0.03 + 0.08 * np.clip(st, 0, 1)

        pieces.append(Piece("cuffs", cuff, role="trim", attach="carrier", uv="unwrap", paint=cuff_paint, value=0.92, compat_value=0.82))
    return GarmentPlan("bottom", spec.name, 1, pieces, keys, [], {"spec": spec.__dict__ | {"paint": None}, **info})


def build_slacks(ctx: BuildContext) -> GarmentPlan:
    """슬랙스: 앞·뒤 칼주름(입체 능선 + 다림질 선), 허리띠·벨트 고리 6·단추(트림), 사선 옆주머니 입구, 뒤 입술 주머니 2, 뒤 다트, 지퍼 덮개, 접힌 밑단.
    형태 키: 기장·품·통(+ 와이드 / − 테이퍼드)·밑위."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    front, back = effective_waist(body, lm.hip_y + (0.115 if female else 0.120), lm.hip_y + (0.140 if female else 0.145))
    spec = PantsSpec(
        name="slacks",
        hem_y=lm.ankle_y + 0.030,
        waist_front=front,
        waist_back=back,
        ease_hip=0.0105,
        ease_thigh=0.0150,
        ease_knee=0.0175,
        ease_hem=0.0185,
        drape_down=0.18,
        band_width=0.032,
        cuff=0.0,
        loops=6,
        paint=wool_paint(0.90, 0.010),
        crease=0.0045,
        target_triangles=7400,
    )
    keys = [
        pants_length_key(body, spec.hem_y, 0.04, 0.08),
        looseness_key(0.012, 0.004),
        flare_key(body, spec.hem_y, 0.030, 0.007, start=lm.knee_y + 0.15),
        rise_key(body, lm.hip_y - 0.02, back, 0.035, 0.025),
    ]
    return build_tailored_pants(ctx, spec, [s_ * a for a in (0.62, 1.62, 2.55) for s_ in (1.0, -1.0)], 0.118 if female else 0.126, keys, crease_line=True)


def build_shorts(ctx: BuildContext) -> GarmentPlan:
    """반바지(치노): 허벅지 중간 기장, 접어 올린 밑단 커프스(트림), 허리띠·벨트 고리 7·단추(트림), 사선 옆주머니 입구, 뒤 입술 주머니 2, 지퍼 덮개.
    형태 키: 기장·품·통(밑단 폭)·밑위."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    front, back = effective_waist(body, lm.hip_y + (0.105 if female else 0.110), lm.hip_y + (0.135 if female else 0.140))
    hem_y = lm.knee_y + (0.150 if female else 0.085)
    spec = PantsSpec(
        name="shorts",
        hem_y=hem_y,
        waist_front=front,
        waist_back=back,
        ease_hip=0.0100,
        ease_thigh=0.0190,
        ease_knee=0.0230,
        ease_hem=0.0230,
        drape_down=0.30,
        band_width=0.034,
        cuff=0.032,
        cuff_lift=0.0030,
        loops=7,
        paint=twill_paint(),
        target_triangles=6400,
    )
    keys = [
        pants_length_key(body, hem_y, 0.07, 0.05),
        looseness_key(0.012, 0.004),
        flare_key(body, hem_y, 0.025, 0.010, start=hem_y + 0.14),
        rise_key(body, lm.hip_y - 0.02, back, 0.030, 0.025),
    ]
    return build_tailored_pants(ctx, spec, [np.pi] + [s_ * a for a in (0.62, 1.62, 2.50) for s_ in (1.0, -1.0)], 0.112 if female else 0.120, keys, crease_line=False)


# ---------------------------------------------------------------- 블레이저(아우터)


def shoulder_pad(height: float = 0.004, x_in: float = 0.09, x_out: float = 0.17, fill_to: float = 0.42) -> Callable[["BaseBody", np.ndarray, np.ndarray], np.ndarray]:
    """어깨 패드: 어깨 윗선을 팔꿈치 쪽(`fill_to`)까지 위쪽 볼록 껍질로 채워 삼각근 뒤 골을 없애고(곧은 소매 윗선),
    목 옆 ~ 어깨 끝(`x_in`~`x_out`)을 `height`만큼 올려 각진 어깨를 만든다."""
    fill = shoulder_line_fill(x_to=fill_to)

    def shape(body: "BaseBody", points: np.ndarray, region: np.ndarray) -> np.ndarray:
        out = fill(body, points, region)
        arm_y = float(body.joint("LeftArm")[1])
        ax = np.abs(out[:, 0])
        w = smoothstep(x_in, x_in + 0.05, ax) * (1.0 - smoothstep(x_out - 0.02, x_out + 0.03, ax)) * smoothstep(arm_y - 0.02, arm_y + 0.03, out[:, 1])
        out[:, 1] += height * w
        return out

    return shape


def grid_flip_for(grid: np.ndarray, row: int, reference: np.ndarray) -> bool:
    """격자 법선(du×dv)이 기준 법선(`row` 행의 정점별 바깥 방향)과 반대면 True — `solidify_grid(flip=...)`에 넘긴다."""
    return float(np.einsum("ij,ij->", grid_normals(grid)[row], reference)) < 0.0


@dataclass
class LapelSpec:
    """라펠 설계값(정면에서 본 m)."""

    peak_out: float = 0.050  # 라펠 끝(피크)이 롤 라인 위쪽 끝(고지)에서 바깥으로 나간 거리
    peak_drop: float = 0.042  # 피크가 고지보다 내려온 높이
    top_in: float = 0.014  # 라펠 윗변 안쪽 끝이 고지에서 바깥으로 나간 거리
    top_drop: float = 0.012
    min_width: float = 0.005  # 맨 아래(첫 단추) 라펠 폭
    roll_lift: float = 0.0030  # 접힘(롤 라인)이 셸보다 더 뜬 높이
    overhang: float = 0.0025  # 롤 라인이 셸의 V 가장자리를 덮고 안쪽으로 넘어간 길이
    lift: float = 0.0016
    thickness: float = 0.0025
    columns: int = 20
    rows: tuple[float, ...] = (0.0, 0.10, 0.25, 0.43, 0.61, 0.78, 0.91, 1.0)


def lapel_slabs(body: "BaseBody", shell: Mesh, neck_loop: np.ndarray, gorge_y: float, spec: LapelSpec) -> tuple[Mesh, dict[str, Any]]:
    """V 가장자리(롤 라인)를 따라 가슴에 눕는 좌우 라펠 판(두께)을 만든다. 바깥 가장자리는 정면에서 그린 선(첫 단추 → 피크 → 윗변 안쪽 끝)을 셸에 투영한다.

    돌려주는 값: (라펠 두 장, 정보 {"gorge": 왼쪽 고지 점, "gorge_phi": 고지의 목 축 각도, "edges": [(바깥 가장자리 점 열, 법선)] × 2}).
    정점 속성 `leaf`(롤 라인 0 → 가장자리 1)와 `leaf_dx/dy/dz`(롤 라인 → 가장자리 벡터)로 형태 키가 라펠 폭을 바꾼다.
    """
    surface, normals_c = surface_frame_normals(shell)
    shell_out = outward(normals_c, shell.positions, body)
    front = neck_loop[(neck_loop[:, 0] > -1e-6) & (neck_loop[:, 2] > body.side_seam_z(neck_loop[:, 1]))]
    roll = front[front[:, 1] <= gorge_y]
    roll = roll[np.argsort(roll[:, 1])]
    roll = resample_polyline(roll, spec.columns)
    gorge = roll[-1]
    b2 = roll[0, :2]
    g2 = gorge[:2]
    p2 = g2 + np.array([spec.peak_out, -spec.peak_drop])
    t2 = g2 + np.array([spec.top_in, -spec.top_drop])
    start = b2 + np.array([spec.min_width, 0.0])
    outline_2d = np.concatenate([np.linspace(start, p2, 40), np.linspace(p2, t2, 12)[1:]])
    outline_2d = resample_polyline(np.concatenate([outline_2d, np.zeros((len(outline_2d), 1))], axis=1), spec.columns)[:, :2]
    outline, _, ok = project_view(surface, normals_c, FRONT, outline_2d, body)
    if not ok.all():
        raise RuntimeError("라펠 가장자리를 셸에 투영하지 못했다")
    span = outline - roll
    span_dir = span / np.maximum(np.linalg.norm(span, axis=1, keepdims=True), 1e-12)
    rows = []
    for v in spec.rows:
        p = roll + span * v
        hit, n = shell_normal_at(surface, normals_c, p, body)
        lift = spec.lift + spec.thickness + spec.roll_lift * (1.0 - smoothstep(0.0, 0.25, v))
        q = hit + n * lift
        if v == 0.0:
            q = q - span_dir * spec.overhang
        rows.append(q)
    grid = np.stack(rows)
    flat = push_outside(grid[1:].reshape(-1, 3), surface, shell_out, spec.lift + spec.thickness)
    grid[1:] = flat.reshape(grid[1:].shape)
    v_attr = np.repeat(np.asarray(spec.rows, dtype=np.float64)[:, None], spec.columns, axis=1)
    meshes, edges = [], []
    _, n_mid = shell_normal_at(surface, normals_c, grid[len(spec.rows) // 2], body)
    for sign in (1.0, -1.0):
        g = grid.copy()
        sp = span.copy()
        ref = n_mid.copy()
        if sign < 0:
            g[:, :, 0] *= -1.0
            sp[:, 0] *= -1.0
            ref[:, 0] *= -1.0
        flip = grid_flip_for(g, len(spec.rows) // 2, ref)
        attrs = {"leaf": v_attr, "leaf_dx": v_attr * 0 + sp[None, :, 0], "leaf_dy": v_attr * 0 + sp[None, :, 1], "leaf_dz": v_attr * 0 + sp[None, :, 2]}
        meshes.append(solidify_grid(g, spec.thickness, flip=flip, attrs=attrs))
        n_out = grid_normals(g) * (-1.0 if flip else 1.0)
        inward = g[-2] - g[-1]
        inward /= np.maximum(np.linalg.norm(inward, axis=1, keepdims=True), 1e-12)
        edges.append((g[-1] + inward * 0.0016, n_out[-1]))
    phi, _ = neck_polar(body, gorge[None, :])
    return merge_meshes(meshes), {"gorge": gorge, "gorge_phi": float(phi[0]), "edges": edges, "roll": roll}


def piping(curves: list[tuple[np.ndarray, np.ndarray]], width: float = 0.0028, height: float = 0.0008) -> Mesh:
    """가장자리 파이핑: (점 열, 바깥 법선) 곡선마다 납작한 띠."""
    parts = [ribbon(c, n, width, height, base=0.0, sink=0.0005) for c, n in curves if len(c) > 2]
    return merge_meshes(parts) if parts else Mesh(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64))


def crop_piece(piece: Piece, keep: Callable[[np.ndarray], np.ndarray]) -> Piece | None:
    """조각에서 삼각형 무게중심이 `keep`을 만족하는 부분만 남긴 새 조각(없으면 None)."""
    mesh = piece.mesh
    centroids = mesh.positions[mesh.triangles].mean(axis=1)
    mask = keep(centroids)
    if not mask.any():
        return None
    cropped, _ = compact(Mesh(mesh.positions, mesh.triangles[mask], mesh.attrs))
    return Piece(piece.name, cropped, role=piece.role, attach=piece.attach, uv=piece.uv, paint=piece.paint, value=piece.value, compat_value=piece.compat_value, ao_strength=piece.ao_strength, smooth_group=piece.smooth_group, normal_smooth=piece.normal_smooth, tags=dict(piece.tags), variants=piece.variants)


def build_blazer(ctx: BuildContext) -> GarmentPlan:
    """블레이저(교복 재킷, 아우터 레이어 2): 노치드 라펠(트림)·칼라(트림, 셔츠 칼라 위에 얹힘), 앞 단추 3·소매 단추 3(트림), 플랩 주머니 2·가슴 웰트(트림),
    어깨 패드, 라펠·칼라 가장자리 파이핑(액센트), 뒤 중심 솔기·앞 여밈선, 앞 밑단이 둥글게 벌어지는 컷어웨이.
    현재 계약(compat, 상의 슬롯)용으로는 V 안쪽에 셔츠 앞판·칼라·리본(여)/넥타이(남)를 함께 넣는다(맨몸에 입어도 V 안이 비지 않게).
    형태 키: 기장·품·소매·라펠 폭."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    shoulder = body.joint("LeftArm")
    wrist = body.joint("LeftHand")
    sleeve_len = float(np.linalg.norm(wrist - shoulder)) - 0.024  # 셔츠 커프스가 1 cm 남짓 보인다
    v_bottom = lm.waist_y + (0.035 if female else 0.020)
    v_half = 0.074 if female else 0.080
    hem_base = max(lm.hip_y - (0.020 if female else 0.030), lm.crotch_y + CROTCH_HEM_CLEARANCE_M)
    # compat 전용 셔츠 앞판의 원본 셔츠를 먼저 짓고, 블레이저 셸·칼라는 그 셔츠(와 파이프라인이 준 레이어 1 상의들) 바깥에 얹는다
    shirt = build_shirt(BuildContext(body, lower_torso=ctx.lower_torso, rig=ctx.rig))
    shirt_surface = merge_meshes([pc.mesh for pc in shirt.pieces if pc.name in ("body", "collar") or pc.name.startswith("tie.")])
    ctx = BuildContext(body, lower_torso=ctx.lower_torso, inner_tops=list(ctx.inner_tops) + [shirt_surface], bottoms=list(ctx.bottoms), gap=ctx.gap, rig=ctx.rig)

    def hem(theta: np.ndarray) -> np.ndarray:
        # 앞 가운데가 둥글게 벌어지는 컷어웨이
        return np.full(len(theta), hem_base) + 0.040 * np.exp(-((theta / 0.20) ** 2))

    spec = TopSpec(
        name="blazer",
        hem=hem,
        sleeve_length=sleeve_len,
        ease_torso=0.022 if female else 0.024,
        ease_sleeve=(0.013, 0.018),
        neck=NeckSpec(front=0.030, side=0.012, back=0.019, v=(v_bottom, v_half)),
        neck_ease=0.008,
        shoulder_ease=0.010,
        drape_down=0.40 if female else 0.28,
        hem_zone_d=0.024,
        folds={"hem": (0.0034, 0.020), "sleeve": (0.0034, 0.020)},
        target_triangles=6400,
        shape=shoulder_pad(),
        layer_gap=ctx.gap,
    )
    main, bands, loops, info = make_top_shell(ctx, spec)
    if info["neckLoop"] is None:
        raise RuntimeError("블레이저 목둘레 고리를 찾지 못했다")
    neck_loop = info["neckLoop"]
    pieces: list[Piece] = []
    seam_hem = float(hem(np.array([np.pi]))[0])

    def main_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        base = top_seam_paint(body, points, 0.90) + 0.010 * hash_noise(points, 0.0025, seed=59)
        back = points[:, 2] < body.side_seam_z(points[:, 1])
        center_back = line_profile(points[:, 0], 0.0, 0.0006) * back * (points[:, 1] > seam_hem)
        front = ~back & (points[:, 1] < v_bottom)
        front_edge = line_profile(points[:, 0], 0.0, 0.0007) * front
        return base - 0.14 * center_back - 0.16 * front_edge

    pieces.append(Piece("body", main, role="main", attach="body", uv="unwrap", paint=main_paint, value=0.90, compat_value=0.70, smooth_group="shell", normal_smooth=22))
    # 라펠
    gorge_y = lm.neck_front_y + (0.020 if female else 0.022)
    lapels, linfo = lapel_slabs(body, main, neck_loop, gorge_y, LapelSpec(peak_out=0.050 if female else 0.056))
    pieces.append(Piece("lapels", lapels, role="trim", attach="body", uv="grid", paint=lambda p_, u, v: 0.90 + 0.010 * hash_noise(p_, 0.0025, seed=61), value=0.90, compat_value=0.62))
    # 칼라: 고지에서 시작해 목 뒤를 돈다(아래 레이어 칼라 위에 얹힘)
    collar_spec = CollarSpec(
        open_angle=max(linfo["gorge_phi"] - 0.04, 0.3),
        stand_back=0.021,
        stand_front=0.016,
        neck_gap=0.016,
        fold_radius=0.0030,
        cover_back=0.026,
        cover_side=0.024,
        point_length=0.040,
        point_spread=0.70,
        point_reach=0.70,
        roll=0.0035,
        columns=14,
        leaf_rows=5,
        thickness=0.0025,
        obstacle_rows="all",
    )
    collar, cinfo = shirt_collar(body, main, neck_loop, collar_spec, obstacles=list(ctx.inner_tops))
    pieces.append(Piece("collar", collar, role="trim", attach="body", uv="grid", paint=lambda p_, u, v: 0.90 + 0.010 * hash_noise(p_, 0.0025, seed=67), value=0.90, compat_value=0.62))
    # 파이핑(액센트): 라펠 가장자리 + 칼라 바깥 가장자리
    collar_edge = cinfo["outer_edge"]
    inward = cinfo["inner_rows"] - collar_edge
    inward /= np.maximum(np.linalg.norm(inward, axis=1, keepdims=True), 1e-12)
    curves = list(linfo["edges"]) + [(collar_edge + inward * 0.0016, cinfo["outer_edge_normals"])]
    pieces.append(Piece("piping", piping(curves), role="accent", attach="carrier", uv="grid", paint=lambda p_, u, v: np.full(len(p_), 0.95), value=0.95, compat_value=0.86))
    # 단추: 앞 3, 소매 3씩
    surface, normals_c = surface_frame_normals(main)
    spacing = min(0.085, (v_bottom - hem_base - 0.07) / 2.0)
    front_buttons = []
    for k in range(3):
        y = v_bottom - 0.010 - spacing * k
        hit = surface_point(surface, normals_c, np.array([0.0, y, 0.6]), np.array([0.0, 0.0, -1.0]))
        if hit is not None:
            front_buttons.append(button(hit[0] + hit[1] * 0.0004, hit[1], np.array([0.0, 1.0, 0.0]), 0.0090, 0.0036, segments=14))
    sleeve_buttons = []
    for sign in (1.0, -1.0):
        arm = AxisFrame(body, "arm", sign)
        up_back = np.array([0.0, 1.0, -1.0]) - (np.array([0.0, 1.0, -1.0]) @ arm.axis) * arm.axis
        up_back /= np.linalg.norm(up_back)
        for k in range(3):
            target = arm.origin + arm.axis * (sleeve_len - 0.032 - 0.016 * k)
            hit = surface_point(surface, normals_c, target + up_back * 0.25, -up_back)
            if hit is not None:
                sleeve_buttons.append(button(hit[0] + hit[1] * 0.0003, hit[1], arm.axis, 0.0050, 0.0022, segments=9))
    pieces.append(Piece("buttons", merge_meshes(front_buttons + sleeve_buttons), role="trim", attach="carrier", uv="grid", paint=button_paint, value=0.95, compat_value=0.85))
    # 주머니: 허리 아래 플랩 2 + 왼쪽 가슴 웰트
    flap_top = hem_base + (0.115 if female else 0.125)
    flaps = []
    for sign in (1.0, -1.0):
        cx = sign * (0.105 if female else 0.115)
        w, h = (0.120 if female else 0.135), 0.046
        poly = np.array([[cx - w / 2, flap_top], [cx + w / 2, flap_top], [cx + w / 2, flap_top - h], [cx - w / 2, flap_top - h]])
        flaps.append(surface_patch(surface, normals_c, FRONT, poly, 0.0010, 0.0024, bevel=0.0025, grid=0.013, edge_step=0.006))
    welt_c = np.array([0.105 if female else 0.115, lm.bust_y + (0.045 if female else 0.050)])
    welt_poly = np.array([[welt_c[0] - 0.050, welt_c[1] - 0.010], [welt_c[0] + 0.050, welt_c[1] - 0.006], [welt_c[0] + 0.050, welt_c[1] + 0.016], [welt_c[0] - 0.050, welt_c[1] + 0.012]])
    welt = surface_patch(surface, normals_c, FRONT, welt_poly, 0.0008, 0.0018, bevel=0.002, grid=0.010, edge_step=0.005)

    def pocket_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        return 0.90 + 0.010 * hash_noise(points, 0.0025, seed=71)

    pieces.append(Piece("pockets", merge_meshes(flaps + [welt]), role="trim", attach="carrier", uv="grid", paint=pocket_paint, value=0.90, compat_value=0.62))
    # compat 전용 셔츠 앞판(셔츠의 V 안쪽만 잘라 쓴다)
    side_y = lm.neck_front_y + 0.03

    def in_v(c: np.ndarray, margin: float = 0.014) -> np.ndarray:
        half = np.maximum(v_half * (c[:, 1] - v_bottom) / max(side_y - v_bottom, 1e-6), 0.012) + margin
        front = c[:, 2] > body.side_seam_z(c[:, 1])
        return front & (c[:, 1] > v_bottom - 0.030) & (np.abs(c[:, 0]) < half)

    for piece in shirt.pieces:
        if piece.name.startswith("collar") or piece.name.startswith("tie."):
            if piece.name.startswith("tie."):
                keep = lambda c: c[:, 1] > v_bottom - 0.012  # noqa: E731
            else:
                # 뒤 날개는 블레이저 칼라 밑에 숨으므로 빼고 앞쪽과 스탠드(목 뒤 밑동 위)만 남긴다
                keep = lambda c: (c[:, 2] > body.side_seam_z(c[:, 1]) + 0.01) | (c[:, 1] > lm.neck_back_y + 0.004)  # noqa: E731
        elif piece.name in ("body", "placket", "buttons"):
            keep = in_v
        else:
            continue
        cropped = crop_piece(piece, keep)
        if cropped is None:
            continue
        cropped.name = f"dickey.{piece.name}"
        cropped.variants = ("compat",)
        cropped.smooth_group = None if piece.name != "body" else "dickey"
        cropped.compat_value = 0.55 if piece.role == "accent" else 0.98
        pieces.append(cropped)
    keys = [
        length_key(lm.waist_y, hem_base, 0.08, 0.05),
        looseness_key(0.012, 0.004),
        sleeve_key(sleeve_len, 0.02, 0.14, start=0.08),
        collar_leaf_key(0.25, 0.30, name="lapel", label_ko="라펠·칼라 폭"),
    ]
    constraints = outer_constraints(ctx)
    return GarmentPlan("outer", "blazer", 2, pieces, keys, constraints, {"sleeveLength": sleeve_len, "vBottom": v_bottom, "hemY": hem_base})


# ---------------------------------------------------------------- 후디(아우터)


def fleece_paint(base: float = 0.93) -> Callable[[np.ndarray], np.ndarray]:
    """기모 면: 아주 고운 결 + 넓은 얼룩(채도 없는 명암만)."""

    def paint(points: np.ndarray) -> np.ndarray:
        return base + 0.008 * hash_noise(points, 0.0022, seed=73) + 0.006 * hash_noise(points, 0.020, seed=79)

    return paint


def drawstrings(body: "BaseBody", shell: Mesh, starts: tuple[np.ndarray, np.ndarray], length: float = 0.150, radius: float = 0.0027) -> Mesh:
    """후드 끈 둘: 후드 앞 끝(`starts`)에서 나와 가슴 위로 늘어지는 끈(관) + 끝 금속 마개(조금 굵은 관) + 끈 구멍 고리."""
    surface, normals_c = surface_frame_normals(shell)
    parts = []
    for start in starts:
        sign = 1.0 if start[0] >= 0 else -1.0
        ts = np.linspace(0.0, 1.0, 18)
        path = []
        for t in ts:
            x = start[0] + sign * 0.006 * t
            y = start[1] - 0.004 - length * t
            hit = surface_point(surface, normals_c, np.array([x, y, 0.6]), np.array([0.0, 0.0, -1.0]))
            z = (hit[0][2] + 0.0065) if hit is not None else start[2]
            # 첫 구간은 후드 앞 끝에서 셸 쪽으로 내려앉는다
            z = max(z, start[2] + 0.004 - 0.25 * (start[1] - y)) if t < 0.25 else z
            path.append([x, y, z])
        path = np.array(path)
        parts.append(tube(path, radius, segments=8))
        tip = path[-1]
        aglet = np.array([tip + np.array([0.0, -0.002 - 0.016 * k / 5.0, 0.0]) for k in range(6)])
        parts.append(tube(aglet, radius * 1.30, segments=8))
        ring = np.array([start + radius * 1.9 * np.array([math.cos(a), math.sin(a), 0.0]) for a in np.linspace(0.0, 2 * np.pi, 13)[:-1]])
        parts.append(tube(ring, 0.0010, segments=6, closed=True))
    return merge_meshes(parts)


def build_hoodie(ctx: BuildContext) -> GarmentPlan:
    """후디(아우터 레이어 2, compat은 상의): 등에 눕힌 후드(두꺼운 테두리 + 등 주머니 돔, 가운데 솔기), 캥거루 주머니(사선 입구), 립 소매단·밑단 띠(트림),
    후드 끈 + 금속 마개(액센트), 기모 질감. 형태 키: 기장·품·소매·후드 크기."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    shoulder = body.joint("LeftArm")
    wrist = body.joint("LeftHand")
    sleeve_len = float(np.linalg.norm(wrist - shoulder)) - 0.004
    hem_y = max(lm.hip_y - (0.012 if female else 0.022), lm.crotch_y + CROTCH_HEM_CLEARANCE_M)
    spec = TopSpec(
        name="hoodie",
        hem=flat_hem(body, hem_y),
        sleeve_length=sleeve_len,
        ease_torso=0.026 if female else 0.028,
        ease_sleeve=(0.016, 0.019),
        neck=NeckSpec(front=0.022, side=0.006, back=0.008),
        neck_ease=0.010,
        shoulder_ease=0.011,
        drape_down=0.32 if female else 0.24,
        hem_zone_d=0.026,
        bands={"hem": (0.055, 0.0026), "sleeve": (0.060, 0.0026)},
        target_triangles=6200,
        shape=shoulder_line_fill(x_to=0.42),
        layer_gap=ctx.gap,
    )
    main, bands, loops, info = make_top_shell(ctx, spec)
    if info["neckLoop"] is None:
        raise RuntimeError("후디 목둘레 고리를 찾지 못했다")
    fleece = fleece_paint()
    pieces: list[Piece] = []

    def main_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        return top_seam_paint(body, points, 0.0) + fleece(points)

    pieces.append(Piece("body", main, role="main", attach="body", uv="unwrap", paint=main_paint, value=0.93, smooth_group="shell", normal_smooth=22))
    for name, band in bands.items():
        pieces.append(Piece(f"rib.{name}", band, role="trim", attach="body" if name == "neck" else "carrier", uv="unwrap", paint=lambda p_, u, v: rib_paint(body, p_, 0.93, 0.08, 0.0034), value=0.92, compat_value=0.80))
    # 후드: 칼라 판과 같은 구성(스탠드 = 후드 테두리 안쪽, 접힘 = 두꺼운 테두리, 날개 = 등에 눕은 후드 주머니)
    hood_spec = CollarSpec(
        open_angle=0.30,
        stand_back=0.040,
        stand_front=0.022,
        neck_gap=0.012,
        fold_radius=0.010,
        cover_back=0.190 if female else 0.205,
        cover_side=0.045,
        point_length=0.010,
        point_spread=0.0,
        point_reach=0.55,
        roll=0.032,
        tuck=0.006,
        leaf_gap=0.002,
        columns=22,
        stand_rows=3,
        leaf_rows=9,
        thickness=0.0032,
        obstacle_rows="all",
    )
    hood, hinfo = shirt_collar(body, main, info["neckLoop"], hood_spec, obstacles=list(ctx.inner_tops))

    def hood_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        back = points[:, 2] < lm.neck_axis_z - 0.03
        seam = line_profile(points[:, 0], 0.0, 0.0007) * back
        return fleece(points) - 0.12 * seam

    pieces.append(Piece("hood", hood, role="main", attach="body", uv="grid", paint=hood_paint, value=0.93))
    # 캥거루 주머니(사선 양옆이 입구)
    surface, normals_c = surface_frame_normals(main)
    y_top = lm.waist_y - (0.030 if female else 0.040)
    y_bot = hem_y + 0.055 + 0.008
    half_top, half_bot = (0.085, 0.125) if female else (0.092, 0.135)
    pocket_poly = np.array([[-half_top, y_top], [half_top, y_top], [half_bot, y_bot], [-half_bot, y_bot]])
    pocket = surface_patch(surface, normals_c, FRONT, pocket_poly, 0.0012, 0.0030, bevel=0.003, grid=0.014, edge_step=0.005)

    def pocket_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        x, y = uvw[:, 0], uvw[:, 1]
        t = np.clip((y - y_bot) / max(y_top - y_bot, 1e-6), 0.0, 1.0)
        side_x = half_bot + (half_top - half_bot) * t
        opening = line_profile(np.abs(x) - (side_x - 0.004), 0.0, 0.0018)  # 사선 입구 그늘
        d = polygon_distance(uvw, pocket_poly)
        st = stitch_line(d, 0.006, x + y) * ((y > y_top - 0.012) | (y < y_bot + 0.012))
        return fleece(points) - 0.18 * opening + 0.10 * np.clip(st, 0, 1) - 0.06 * line_profile(d, 0.0, 0.0006)

    pieces.append(Piece("pocket", pocket, role="main", attach="carrier", uv="grid", paint=pocket_paint, value=0.93))
    cords = drawstrings(body, main, hinfo["front_ends"], 0.150 if female else 0.165)
    pieces.append(Piece("drawstrings", cords, role="accent", attach="carrier", uv="grid", paint=lambda p_, u, v: 0.95 + 0.006 * hash_noise(p_, 0.002), value=0.95, compat_value=0.98, ao_strength=0.3))
    keys = [
        length_key(lm.waist_y, hem_y, 0.08, 0.06),
        looseness_key(0.014, 0.006),
        sleeve_key(sleeve_len, 0.03, 0.14, start=0.08),
        collar_leaf_key(0.20, 0.25, name="hood", label_ko="후드 크기"),
    ]
    return GarmentPlan("outer", "hoodie", 2, pieces, keys, outer_constraints(ctx), {"sleeveLength": sleeve_len, "hemY": hem_y})


# ---------------------------------------------------------------- 카디건·니트 조끼(아우터, 레이어드 전용)


def knit_paint(base: float = 0.92, depth: float = 0.035, period: float = 0.0045) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
    """메리야스 니트: 월드 UV 가로 방향으로 반복되는 세로 골 + 고운 결."""

    def paint(points: np.ndarray, uvw: np.ndarray) -> np.ndarray:
        rib = 0.5 + 0.5 * np.cos(2.0 * np.pi * uvw[:, 0] / period)
        return base - depth * rib + 0.006 * hash_noise(points, 0.003, seed=83)

    return paint


def waist_key(body: "BaseBody", plus: float, minus: float, width: float = 0.09) -> ShapeKey:
    """허리 핏: 허리 높이 둘레를 몸통 축 쪽으로 당기거나(+ 잘록) 푼다(− 일자). 몸 최소 오프셋은 조립 때 지킨다."""
    lm = body.landmarks

    def delta(ctx: ShapeContext, sign: float) -> np.ndarray:
        frame = AxisFrame(ctx.body, "torso")
        axial, _ = arm_axial(ctx.body, ctx.positions)
        torso = (axial < 0.0) | (np.abs(ctx.positions[:, 0]) < 0.12)
        _, _, _, direction = frame.cyl(ctx.positions)
        w = np.exp(-(((ctx.positions[:, 1] - lm.waist_y) / width) ** 2)) * torso
        return -direction * (sign * (plus if sign > 0 else minus) * w)[:, None]

    return ShapeKey("waist", delta, note_ko=f"허리 핏 +{plus * 1000:.0f} mm 잘록 / −{minus * 1000:.0f} mm 일자")


def surface_offset_curve(surface: Surface, normals: np.ndarray, edge: np.ndarray, toward: np.ndarray, distance: float, lift: float, body: "BaseBody") -> tuple[np.ndarray, np.ndarray]:
    """가장자리 점 열에서 표면을 따라 `toward`(점마다 표면 방향) 쪽으로 `distance` 들어간 곡선과 그 바깥 법선(표면 + `lift`)."""
    pts = np.array([walk_on_surface(surface, normals, edge[k : k + 1], toward[k : k + 1], distance, steps=3)[-1, 0] for k in range(len(edge))])
    hit, n = shell_normal_at(surface, normals, pts, body)
    return hit + n * lift, n


def neck_band_stripes(body: "BaseBody", band: Mesh, neck_loop: np.ndarray, distances: tuple[float, ...], width: float = 0.0028) -> Mesh:
    """목둘레 립 띠 위 줄무늬: 목둘레 가장자리에서 띠 표면을 따라 `distances`만큼 들어간 닫힌 곡선마다 납작한 띠."""
    surface, normals_c = surface_frame_normals(band)
    phi, _ = neck_polar(body, neck_loop)
    ring = neck_loop[np.argsort(phi)]
    ring = resample_polyline(np.concatenate([ring, ring[:1]]), 120)[:-1]
    _, n = shell_normal_at(surface, normals_c, ring, body)
    tangent = np.roll(ring, -1, axis=0) - np.roll(ring, 1, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-12)
    away = np.cross(tangent, n)
    away /= np.maximum(np.linalg.norm(away, axis=1, keepdims=True), 1e-12)
    rel = ring - np.array([0.0, 0.0, body.landmarks.neck_axis_z])
    outward_xy = rel.copy()
    outward_xy[:, 1] = 0.0
    flip = (np.einsum("ij,ij->i", away, outward_xy) - away[:, 1] * 0.05) < 0.0
    away[flip] *= -1.0
    stripes = []
    for d in distances:
        curve, nn = surface_offset_curve(surface, normals_c, ring, away, d, 0.0, body)
        stripes.append(ribbon(curve, nn, width, 0.0008, closed=True, base=0.0, sink=0.0005))
    return merge_meshes(stripes)


def knit_outer(ctx: BuildContext, name: str, v_bottom: float, v_half: float, sleeve_len: float | None, hem_y: float, ease: float, bands: dict[str, tuple[float, float]]) -> tuple[Mesh, dict[str, Mesh], dict[str, Any], TopSpec]:
    """니트 아우터 공통 셸(V넥, 립 띠). (본판, 띠들, 정보, 설계값)."""
    body = ctx.body
    female = body.base_id == "female"
    spec = TopSpec(
        name=name,
        hem=flat_hem(body, hem_y),
        sleeve_length=sleeve_len,
        ease_torso=ease,
        ease_sleeve=(0.012, 0.015),
        neck=NeckSpec(front=0.028, side=0.008, back=0.012, v=(v_bottom, v_half)),
        neck_ease=0.007,
        shoulder_ease=0.009,
        drape_down=0.40 if female else 0.28,
        hem_zone_d=0.022,
        bands=bands,
        target_triangles=6600,
        shape=shoulder_line_fill(x_to=0.42) if sleeve_len is not None else shoulder_line_fill(),
        layer_gap=ctx.gap,
    )
    main, band_meshes, _, info = make_top_shell(ctx, spec)
    return main, band_meshes, info, spec


def build_cardigan(ctx: BuildContext) -> GarmentPlan:
    """카디건(아우터 레이어 2, 레이어드 전용): V넥 립(트림)·앞 여밈 띠(트림)·단추 5(트림)·립 밑단·소매단(트림), 패치 주머니 2, 메리야스 니트.
    형태 키: 기장·품·소매·허리 핏."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    shoulder = body.joint("LeftArm")
    wrist = body.joint("LeftHand")
    sleeve_len = float(np.linalg.norm(wrist - shoulder)) - 0.010
    v_bottom = lm.bust_y - (0.020 if female else 0.035)
    hem_y = max(lm.hip_y - (0.004 if female else 0.014), lm.crotch_y + CROTCH_HEM_CLEARANCE_M)
    main, bands, info, spec = knit_outer(ctx, "cardigan", v_bottom, 0.062 if female else 0.066, sleeve_len, hem_y, 0.020 if female else 0.022, {"neck": (0.024, 0.0022), "hem": (0.050, 0.0024), "sleeve": (0.055, 0.0024)})
    knit = knit_paint()
    pieces: list[Piece] = [Piece("body", main, role="main", attach="body", uv="unwrap", paint=lambda p_, u, v: knit(p_, u) + top_seam_paint(body, p_, 0.0, darkness=0.10), value=0.92, smooth_group="shell", normal_smooth=22)]
    for name, band in bands.items():
        pieces.append(Piece(f"rib.{name}", band, role="trim", attach="body" if name == "neck" else "carrier", uv="unwrap", paint=lambda p_, u, v: rib_paint(body, p_, 0.93, 0.08, 0.0034), value=0.92, compat_value=0.80))
    # 앞 여밈 띠(V 맨 아래 → 밑단 띠 위) + 단추 5
    surface, normals_c = surface_frame_normals(main)
    ys = np.linspace(v_bottom + 0.004, hem_y + 0.050, 30)
    pts, ns = [], []
    for y in ys:
        hit = surface_point(surface, normals_c, np.array([0.0, y, 0.6]), np.array([0.0, 0.0, -1.0]))
        if hit is not None:
            pts.append(hit[0])
            ns.append(hit[1])
    placket = ribbon(np.array(pts), np.array(ns), 0.024, 0.0022, base=0.0, sink=0.0012)
    pieces.append(Piece("front_band", placket, role="trim", attach="carrier", uv="grid", paint=lambda p_, u, v: rib_paint(body, p_, 0.93, 0.06, 0.0034), value=0.92, compat_value=0.80))
    buttons = []
    for y in np.linspace(v_bottom - 0.010, hem_y + 0.075, 5):
        hit = surface_point(surface, normals_c, np.array([0.0, y, 0.6]), np.array([0.0, 0.0, -1.0]))
        if hit is not None:
            buttons.append(button(hit[0] + hit[1] * 0.0024, hit[1], np.array([0.0, 1.0, 0.0]), 0.0062, 0.0026, segments=12))
    pieces.append(Piece("buttons", merge_meshes(buttons), role="trim", attach="carrier", uv="grid", paint=button_paint, value=0.95, compat_value=0.85))
    # 패치 주머니 2
    pockets = []
    for sign in (1.0, -1.0):
        cx = sign * (0.098 if female else 0.106)
        top = hem_y + 0.050 + (0.115 if female else 0.125)
        poly = np.array([[cx - 0.055, top], [cx + 0.055, top], [cx + 0.055, top - 0.110], [cx - 0.055, top - 0.110]])
        pockets.append((poly, surface_patch(surface, normals_c, FRONT, poly, 0.0010, 0.0022, bevel=0.002, grid=0.012, edge_step=0.005)))

    def pocket_paint(points: np.ndarray, uvw: np.ndarray, variant: str) -> np.ndarray:
        top_rib = np.zeros(len(points))
        for poly, _ in pockets:
            inside = point_in_polygon(uvw, poly)
            top_rib = np.maximum(top_rib, inside * (uvw[:, 1] > poly[0, 1] - 0.018))
        return knit(points, uvw) - 0.05 * top_rib * (0.5 + 0.5 * np.cos(2.0 * np.pi * uvw[:, 0] / 0.0034))

    pieces.append(Piece("pockets", merge_meshes([m for _, m in pockets]), role="main", attach="carrier", uv="grid", paint=pocket_paint, value=0.92))
    keys = [
        length_key(lm.waist_y, hem_y, 0.08, 0.06),
        looseness_key(0.012, 0.005),
        sleeve_key(sleeve_len, 0.02, 0.14, start=0.08),
        waist_key(body, 0.010, 0.006),
    ]
    return GarmentPlan("outer", "cardigan", 2, pieces, keys, outer_constraints(ctx), {"sleeveLength": sleeve_len, "hemY": hem_y, "layeredOnly": True})


def build_vest(ctx: BuildContext) -> GarmentPlan:
    """니트 조끼(교복 스웨터 조끼, 아우터 레이어 2, 레이어드 전용): V넥 립(트림) 위 줄무늬 두 줄(액센트), 진동둘레 립·밑단 립(트림), 밑단 줄무늬(액센트), 메리야스 니트.
    형태 키: 기장·품·허리 핏."""
    body = ctx.body
    lm = body.landmarks
    female = body.base_id == "female"
    v_bottom = lm.bust_y - (0.035 if female else 0.020)
    hem_y = max(lm.hip_y + (0.012 if female else 0.004), lm.crotch_y + CROTCH_HEM_CLEARANCE_M)
    main, bands, info, spec = knit_outer(ctx, "vest", v_bottom, 0.060 if female else 0.050, None, hem_y, 0.016 if female else 0.018, {"neck": (0.022, 0.0022), "hem": (0.048, 0.0024), "sleeve": (0.020, 0.0022)})
    knit = knit_paint(0.92, 0.04, 0.0050)
    pieces: list[Piece] = [Piece("body", main, role="main", attach="body", uv="unwrap", paint=lambda p_, u, v: knit(p_, u) + top_seam_paint(body, p_, 0.0, darkness=0.10), value=0.92, smooth_group="shell", normal_smooth=22, tags={"sleeveless": True})]
    for name, band in bands.items():
        pieces.append(Piece(f"rib.{name}", band, role="trim", attach="body" if name == "neck" else "carrier", uv="unwrap", paint=lambda p_, u, v: rib_paint(body, p_, 0.93, 0.08, 0.0034), value=0.92, compat_value=0.80))
    stripes = []
    if info["neckLoop"] is not None and "neck" in bands:
        stripes.append(neck_band_stripes(body, bands["neck"], info["neckLoop"], (0.0080, 0.0140)))
    # 밑단 줄무늬: 밑단 띠 위쪽에서 1.6 cm
    hem_band = bands.get("hem")
    if hem_band is not None:
        h_surface, h_normals = surface_frame_normals(hem_band)
        frame = AxisFrame(body, "torso")
        thetas = np.linspace(-np.pi, np.pi, 96, endpoint=False)
        y = hem_y + 0.048 - 0.016
        cz = body.torso_center_z(np.full(len(thetas), y))
        direction = np.stack([np.sin(thetas), np.zeros(len(thetas)), np.cos(thetas)], axis=1)
        origins = np.stack([np.zeros(len(thetas)), np.full(len(thetas), y), cz], axis=1) + direction * 0.6
        hits, tri = h_surface.ray(origins, -direction, 0.6)
        if (tri >= 0).all():
            _, n = shell_normal_at(h_surface, h_normals, hits, body)
            stripes.append(ribbon(hits, n, 0.0030, 0.0008, closed=True, base=0.0, sink=0.0005))
        del frame
    if stripes:
        pieces.append(Piece("stripes", merge_meshes(stripes), role="accent", attach="carrier", uv="grid", paint=lambda p_, u, v: np.full(len(p_), 0.96), value=0.96, compat_value=0.98))
    keys = [
        length_key(lm.waist_y, hem_y, 0.07, 0.05),
        looseness_key(0.012, 0.004),
        waist_key(body, 0.010, 0.006),
    ]
    return GarmentPlan("outer", "vest", 2, pieces, keys, outer_constraints(ctx), {"hemY": hem_y, "layeredOnly": True})
