"""절차 생성 신발 4종(스니커즈·로퍼·부츠·샌들) — 베이스 발 형상에 맞춘 원본 파츠 (license: original, 외부 에셋·생성 AI 없음).

2026-10-14/15 Hyper3D 파생 신발이 상업 이용 증빙 부족으로 키트에서 빠져 남녀 모두 신발이 0종이었다. 이 모듈은 이 저장소가 직접 신발을 만든다.
지오메트리는 베이스 npz(`base_model_<base>.npz`)의 발·종아리 정점에서 계산하므로 같은 코드가 두 베이스(webtoon-girl·webtoon-boy)에 맞는다.
진입 스크립트는 `forge_build_shoes.py`다(빌드·보고서·근접 렌더).

발 좌표계(`FootFrame`, 단위 m)
- u: 뒤꿈치 뒤끝(0)에서 발끝 쪽(앞)으로. 발끝 = `length`.
- w: 바깥쪽(왼발 ≈ +x, 오른발 ≈ −x)이 +. 바깥/안쪽을 부호로 정했으므로 디자인(바깥쪽 버클 등)이 양발에 거울 대칭으로 들어가고
  양발이 텍스처 한 장을 같이 쓴다(왼발 격자로 굽고 오른발은 같은 (열, 행) UV를 쓴다).
- v: 발 정점의 최저 높이(≈ 월드 y 0, 볼 아래) 위로. 베이스 발은 뒤꿈치가 볼보다 약 8 mm 떠 있다(살짝 발끝으로 선 자세) — 깔창은 이 발바닥 면을 따른다.

한 짝을 만드는 흐름
1. 라스트(last, `build_last`): 발(+부츠는 종아리) 정점을 여유(clearance)만큼 법선 방향으로 부풀리고 스타일 변형(앞코 연장·앞코 높이·코 모양)을 한 뒤
   볼록 껍질 → 복셀 리메시 → 라플라시안 평활로 매끈한 닫힌 면을 만든다. 갑피는 이 면 위에 놓이므로 발가락 사이 골·복사뼈 굴곡을 따라가지 않는다.
2. 열(column): 발 축 위 선분(경기장 모양)에서 수평으로 쏜 광선 방향이 열이다. 밑창 옆벽·갑피 아래 고리가 같은 열을 쓴다.
3. 밑창(`build_sole`): 열마다 라스트 단면에서 가장 넓은 높이까지는 수직 벽, 그 위는 라스트를 따라 `v_top`까지 감싼다(발가락 범퍼). 바닥은 평평하다
   (앞코 들림·허리 홈만 위로 올라간다) — 바닥 최저 높이가 땅이다. 아래 모서리 모따기, 위 모서리 둥글림, 윗 턱이 갑피에 닿는다.
4. 갑피(`annulus_on_last`): 밑창 안으로 숨는 아래 고리 B와 발목 입구 고리 T(칼라) 사이의 고리띠를 라스트 위에서 조화 이완(라플라시안 + 최근접 투영)으로 편다.
5. 디테일(스타일별): 칼라 패딩 관, 신발끈·아일릿 띠·혀·뒤꿈치 탭(스니커즈), 모크 솔기·페니 스트랩·웰트(로퍼), 끈·당김 탭(부츠), 스트랩·버클(샌들).
6. 상대색 텍스처(1024², 휘도만, `ShoeAtlas`): 갑피는 (열, 행) 좌표 → 발 좌표로 바꿔 굽는다(앞코 덧댐·뒤꿈치 보강·스티치·펀칭). 밑창 옆벽 줄무늬, 바닥 무늬,
   띠(스트랩·끈) 가장자리 스티치, 작은 부품의 단색 칸. 틴트는 곱셈이라 어둡게만 만들 수 있으므로 기본면을 0.8~0.97로 두고 스티치는 1.0(밝게)로 낸다.
7. 몸 결합(`attach_to_body`): 스킨은 법선이 호환되는 가까운 몸 정점의 웨이트(`garment_fit.compatible_vertex_skin`), 체형 morph 18개는 법선이 호환되는
   최근접 몸 표면점의 델타를 무게중심으로 보간한다(검증기 V9 따라가기 기준과 같은 몸). 발에서 0인 morph에는 `ensure_min_delta` 바닥을 한 정점에만 더한다.

땅과 발 디딤: 베이스는 발바닥(볼)이 y 0이다(검증기 V7). 파츠가 몸을 들어 올릴 계약 수단이 없으므로 신발 바닥은 y = −두께에 놓이고 깔창 윗면은 발바닥보다
0.5 mm 아래다(발이 깔창에 닿는다). 이 오프셋은 보고서·레지스트리(`groundOffsetM`)에 남긴다.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np

UP = np.array([0.0, 1.0, 0.0])
SHOE_NAMES = ("sneakers", "loafers", "boots", "sandals")
ATLAS_SIZE = 1024

#: 깔창 윗면을 발바닥보다 이만큼 아래에 둔다(m). 발이 깔창에 닿되 같은 면에서 깜박이지 않게 한다.
INSOLE_GAP_M = 0.0005


# ---------------------------------------------------------------- 작은 도구


def smoothstep(edge0: float, edge1: float, x: Any) -> np.ndarray:
    span = edge1 - edge0
    t = np.clip((np.asarray(x, dtype=np.float64) - edge0) / (span if abs(span) > 1e-12 else 1e-12), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def unit(v: Any) -> np.ndarray:
    v = np.asarray(v, dtype=np.float64)
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def resample_polyline(points: np.ndarray, count: int, closed: bool = False, weights: np.ndarray | None = None) -> np.ndarray:
    """꺾은선을 (가중) 호 길이로 `count`개 다시 고른다. 닫힌 선이면 첫 점을 지키고 끝점을 반복하지 않는다."""
    pts = np.asarray(points, dtype=np.float64)
    if closed:
        pts = np.vstack([pts, pts[:1]])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    if weights is not None:
        w = np.asarray(weights, dtype=np.float64)
        if closed:
            w = np.append(w, w[:1])
        seg = seg * 0.5 * (w[:-1] + w[1:])
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    total = cum[-1]
    targets = np.linspace(0.0, total, count, endpoint=not closed) if not closed else np.arange(count) * total / count
    out = np.empty((count, pts.shape[1]))
    for k in range(pts.shape[1]):
        out[:, k] = np.interp(targets, cum, pts[:, k])
    return out


def polyline_fractions(points: np.ndarray) -> np.ndarray:
    """꺾은선 점마다 처음에서의 호 길이 비율(0~1)."""
    seg = np.linalg.norm(np.diff(points, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    return cum / max(cum[-1], 1e-12)


# ---------------------------------------------------------------- 발 좌표계


@dataclass(frozen=True)
class FootFrame:
    side: str  # "L"(캐릭터 왼발, +x) | "R"
    origin: np.ndarray  # 월드: 발 축선 위 뒤꿈치 뒤끝(u 0), 높이 = 발 최저점
    forward: np.ndarray  # 월드 수평 단위벡터(발끝 쪽)
    lateral: np.ndarray  # 월드 수평 단위벡터(바깥쪽)
    length: float
    width: float
    leg: np.ndarray  # 발 좌표 (u, w): 발목 위 다리 중심(종아리 단면 중심)

    def to_local(self, points: Any) -> np.ndarray:
        d = np.asarray(points, dtype=np.float64) - self.origin
        return np.stack([d @ self.forward, d @ self.lateral, d[..., 1]], axis=-1)

    def to_world(self, local: Any) -> np.ndarray:
        local = np.asarray(local, dtype=np.float64)
        return self.origin + local[..., 0:1] * self.forward + local[..., 1:2] * self.lateral + local[..., 2:3] * UP

    def dir_to_world(self, local_dir: Any) -> np.ndarray:
        d = np.asarray(local_dir, dtype=np.float64)
        return d[..., 0:1] * self.forward + d[..., 1:2] * self.lateral + d[..., 2:3] * UP

    def dir_to_local(self, world_dir: Any) -> np.ndarray:
        d = np.asarray(world_dir, dtype=np.float64)
        return np.stack([d @ self.forward, d @ self.lateral, d[..., 1]], axis=-1)


def body_region_vertices(base: Any, region_names: tuple[str, ...]) -> tuple[np.ndarray, np.ndarray]:
    """TS_Body T-포즈에서 영역 정점(위치, 단위 법선)."""
    body = base.mesh("body_")
    positions = body["tpose_positions"].astype(np.float64)
    normals = unit(body["normals"].astype(np.float64))
    mask = np.isin(body["region"], [base.region_ids.index(name) for name in region_names])
    return positions[mask], normals[mask]


def measure_foot(base: Any, side: str) -> FootFrame:
    """발 영역 정점으로 발 좌표계를 정한다: 발바닥 2 cm 안 정점의 수평 주성분이 앞 방향, 뒤꿈치 뒤끝이 원점."""
    foot, _ = body_region_vertices(base, (f"foot.{side}",))
    y0 = float(foot[:, 1].min())
    low = foot[foot[:, 1] < y0 + 0.02]
    center = low[:, [0, 2]].mean(axis=0)
    spread = low[:, [0, 2]] - center
    values, vectors = np.linalg.eigh(spread.T @ spread)
    axis = vectors[:, int(np.argmax(values))]
    if axis[1] < 0:
        axis = -axis
    forward = unit(np.array([axis[0], 0.0, axis[1]]))
    lateral = unit(np.cross(UP, forward))  # 왼발 기준 바깥(+x 쪽)
    if side == "R":
        lateral = -lateral
    base_origin = np.array([center[0], y0, center[1]])
    u = (foot - base_origin) @ forward
    origin = base_origin + float(u.min()) * forward
    w = (foot - origin) @ lateral
    calf, _ = body_region_vertices(base, (f"calf.{side}",))
    ring = calf[np.abs(calf[:, 1] - (y0 + 0.12)) < 0.012]
    leg_local = np.array([float(((ring - origin) @ forward).mean()), float(((ring - origin) @ lateral).mean())])
    return FootFrame(side=side, origin=origin, forward=forward, lateral=lateral, length=float(u.max() - u.min()), width=float(w.max() - w.min()), leg=leg_local)


# ---------------------------------------------------------------- 깔창 면(발바닥 아래 매끈한 받침면)


@dataclass
class FootbedSurface:
    """발 좌표 (u, w)의 깔창 윗면 높이 v = 다항식(1, u, u², u³, w, w², u·w; u는 발 길이로 나눔). 모든 발바닥 정점보다 `gap` 아래에 있다."""

    coef: np.ndarray
    length: float
    u_range: tuple[float, float]
    w_range: tuple[float, float]
    pads: list[tuple[float, float, float, float]] = field(default_factory=list)  # (u, w, 반지름 σ, 높이)

    def basis(self, u: np.ndarray, w: np.ndarray) -> np.ndarray:
        x = np.clip(np.asarray(u, dtype=np.float64), *self.u_range) / self.length
        y = np.clip(np.asarray(w, dtype=np.float64), *self.w_range) / self.length
        return np.stack([np.ones_like(x), x, x * x, x * x * x, y, y * y, x * y], axis=-1)

    def smooth(self, u: Any, w: Any) -> np.ndarray:
        return self.basis(u, w) @ self.coef

    def pad_shape(self, k: int, u: Any, w: Any) -> np.ndarray:
        pu, pw, sigma, _ = self.pads[k]
        d2 = (np.asarray(u, dtype=np.float64) - pu) ** 2 + (np.asarray(w, dtype=np.float64) - pw) ** 2
        return np.exp(-d2 / (2.0 * sigma * sigma))

    def height(self, u: Any, w: Any) -> np.ndarray:
        out = self.smooth(u, w)
        for k, pad in enumerate(self.pads):
            out = out + pad[3] * self.pad_shape(k, u, w)
        return out


def footbed_surface(frame: FootFrame, base: Any, gap: float = INSOLE_GAP_M) -> tuple[FootbedSurface, dict[str, float]]:
    """발바닥(법선 아래향) 정점의 아래 포락면을 다항식으로 맞춘다: 맞춤 → 면보다 2 mm 넘게 위인 점(아치·발가락 끝 굴곡) 제외 → 다시 맞춤을
    반복해 뒤꿈치·볼·발가락 패드가 닿는 면을 얻고, 모든 발바닥 점이 `gap` 이상 위에 오도록 내린다. 매끈하므로 삼각형으로 나눠도 발을 뚫지 않는다.
    반환: 면, 접촉 통계(뒤꿈치·볼 중심의 간격 mm)."""
    points, normals = body_region_vertices(base, (f"foot.{frame.side}",))
    loc = frame.to_local(points)
    normal_v = frame.dir_to_local(normals)[:, 2]
    plant = loc[normal_v < -0.5]
    length = frame.length
    surface = FootbedSurface(np.zeros(7), length, (float(plant[:, 0].min()) - 0.01, float(plant[:, 0].max()) + 0.01), (float(plant[:, 1].min()) - 0.01, float(plant[:, 1].max()) + 0.01))
    keep = np.ones(len(plant), dtype=bool)
    for _ in range(6):
        A = surface.basis(plant[keep, 0], plant[keep, 1])
        surface.coef, *_ = np.linalg.lstsq(A, plant[keep, 2], rcond=None)
        residual = plant[:, 2] - surface.height(plant[:, 0], plant[:, 1])
        keep = residual < 0.002
    residual = plant[:, 2] - surface.height(plant[:, 0], plant[:, 1])
    surface.coef[0] += float(residual.min()) - gap
    # 접촉 패드: 뒤꿈치·엄지발가락 쪽 볼·새끼발가락 쪽 볼 아래를 가우스 돋움으로 올려 그곳 발바닥이 깔창에 닿게 한다.
    # 높이는 "모든 발바닥 점이 gap 이상 위"를 지키는 최대값(패드끼리 겹치는 몫은 차례로 뺀다)
    for pu, pw, sigma in ((0.11 * length, -0.004, 0.013), (0.70 * length, -0.024, 0.011), (0.80 * length, 0.020, 0.011)):
        surface.pads.append((pu, pw, sigma, 0.0))
        k = len(surface.pads) - 1
        room = plant[:, 2] - surface.height(plant[:, 0], plant[:, 1]) - gap
        shape = surface.pad_shape(k, plant[:, 0], plant[:, 1])
        significant = shape > 0.02
        allowed = float(np.min(room[significant] / shape[significant])) if significant.any() else 0.0
        surface.pads[k] = (pu, pw, sigma, max(0.0, allowed))
    residual = plant[:, 2] - surface.height(plant[:, 0], plant[:, 1])

    def gap_at(u0: float, w0: float, radius: float = 0.012) -> float:
        near = np.hypot(plant[:, 0] - u0, plant[:, 1] - w0) < radius
        return float(residual[near].min()) * 1000 if near.any() else float("nan")

    stats = {
        "heelGapMm": round(gap_at(surface.pads[0][0], surface.pads[0][1], 0.008), 2),
        "ballMedialGapMm": round(gap_at(surface.pads[1][0], surface.pads[1][1], 0.008), 2),
        "ballLateralGapMm": round(gap_at(surface.pads[2][0], surface.pads[2][1], 0.008), 2),
        "minGapMm": round(float(residual.min()) * 1000, 2),
        "medianGapMm": round(float(np.median(residual)) * 1000, 2),
    }
    return surface, stats


# ---------------------------------------------------------------- 라스트(신발 골)


def convex_hull(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """점 구름의 볼록 껍질(bmesh). 삼각형은 바깥이 반시계(부호 있는 부피 양수)."""
    import bpy  # noqa: F401 — bmesh는 bpy 뒤에만 가져올 수 있다
    import bmesh

    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in np.asarray(points, dtype=np.float64).tolist()]
    result = bmesh.ops.convex_hull(bm, input=verts, use_existing_faces=False)
    drop = list({id(g): g for g in result["geom_interior"] + result["geom_unused"] if isinstance(g, bmesh.types.BMVert)}.values())
    if drop:
        bmesh.ops.delete(bm, geom=drop, context="VERTS")
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.index_update()
    positions = np.array([v.co[:] for v in bm.verts], dtype=np.float64)
    triangles = np.array([[v.index for v in f.verts] for f in bm.faces], dtype=np.int64)
    bm.free()
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    if np.einsum("ij,ij->i", a, np.cross(b, c)).sum() < 0:
        triangles = triangles[:, [0, 2, 1]]
    return positions, triangles


def remesh_smooth(positions: np.ndarray, triangles: np.ndarray, voxel: float, iterations: int) -> tuple[np.ndarray, np.ndarray]:
    """복셀 리메시 + 부피 보존 라플라시안 평활(Blender 모디파이어를 평가만 하고 결과 배열을 꺼낸다)."""
    import bpy

    mesh = bpy.data.meshes.new("forge_last")
    mesh.from_pydata(np.asarray(positions).tolist(), [], np.asarray(triangles).tolist())
    obj = bpy.data.objects.new("forge_last", mesh)
    bpy.context.scene.collection.objects.link(obj)
    try:
        remesh = obj.modifiers.new("remesh", "REMESH")
        remesh.mode = "VOXEL"
        remesh.voxel_size = voxel
        remesh.adaptivity = 0.0
        if iterations > 0:
            smooth = obj.modifiers.new("smooth", "LAPLACIANSMOOTH")
            smooth.iterations = iterations
            smooth.lambda_factor = 0.6
            smooth.lambda_border = 0.0
            smooth.use_volume_preserve = True
        graph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(graph)
        out = evaluated.to_mesh()
        out.calc_loop_triangles()
        count = len(out.vertices)
        flat = np.empty(count * 3, dtype=np.float64)
        out.vertices.foreach_get("co", flat)
        tris = np.empty(len(out.loop_triangles) * 3, dtype=np.int64)
        out.loop_triangles.foreach_get("vertices", tris)
        evaluated.to_mesh_clear()
    finally:
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(mesh)
    out_positions, out_triangles = flat.reshape(-1, 3), tris.reshape(-1, 3)
    a, b, c = (out_positions[out_triangles[:, k]] for k in range(3))
    if np.einsum("ij,ij->i", a, np.cross(b, c)).sum() < 0:
        out_triangles = out_triangles[:, [0, 2, 1]]
    return out_positions, out_triangles


@dataclass
class Last:
    """신발 골: 부풀린 발의 매끈한 볼록 닫힌 면(월드 좌표)과 안쪽 축(척추)."""

    frame: FootFrame
    positions: np.ndarray
    triangles: np.ndarray
    normals: np.ndarray
    surface: Any
    spine: list[tuple[np.ndarray, np.ndarray]]  # 월드 선분들(라스트 안)
    core_u: tuple[float, float]  # 열 광선의 발 축 선분 구간(u)

    def closest(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        hits = self.surface.closest(np.asarray(points, dtype=np.float64))
        corners = self.triangles[hits.triangle]
        normal = unit(np.einsum("mc,mck->mk", hits.bary, self.normals[corners]))
        return hits.point, normal

    def normal_at(self, points: np.ndarray) -> np.ndarray:
        return self.closest(points)[1]

    def spine_origin(self, points: np.ndarray) -> np.ndarray:
        points = np.asarray(points, dtype=np.float64)
        best = np.zeros_like(points)
        best_d = np.full(len(points), np.inf)
        for a, b in self.spine:
            ab = b - a
            t = np.clip(((points - a) @ ab) / max(float(ab @ ab), 1e-12), 0.0, 1.0)
            q = a + t[:, None] * ab
            d = np.linalg.norm(points - q, axis=1)
            better = d < best_d
            best[better], best_d[better] = q[better], d[better]
        return best

    def lift(self, points: np.ndarray) -> np.ndarray:
        """척추의 가장 가까운 점에서 그 점을 지나는 광선이 라스트를 빠져나가는 점(라스트 안쪽 점을 겉면으로 들어 올린다)."""
        points = np.asarray(points, dtype=np.float64)
        origins = self.spine_origin(points)
        directions = unit(points - origins)
        hits, triangle = self.surface.ray(origins, directions, 1.0)
        out = np.where((triangle >= 0)[:, None], hits, self.closest(points)[0])
        return out

    def cast_exit(self, origins: np.ndarray, directions: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """안쪽에서 쏜 광선의 출구점과 유효 여부(맞힌 면 법선이 광선과 같은 쪽 = 안에서 나간 것)."""
        hits, triangle = self.surface.ray(np.asarray(origins, dtype=np.float64), unit(directions), 1.0)
        ok = triangle >= 0
        exiting = np.zeros(len(origins), dtype=bool)
        if ok.any():
            exiting[ok] = np.einsum("ij,ij->i", self.surface.face_normals[triangle[ok]], unit(directions)[ok]) > 0.0
        return hits, exiting

    def top_point(self, u: Any, w: Any, offset: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """발 좌표 (u, w) 위에서 아래로 쏜 광선이 맞힌 라스트 윗면 점(+ 법선 방향 offset)과 법선(월드)."""
        u = np.atleast_1d(np.asarray(u, dtype=np.float64))
        w = np.atleast_1d(np.asarray(w, dtype=np.float64))
        local = np.stack([u, w, np.full(len(u), 0.6)], axis=1)
        origins = self.frame.to_world(local)
        down = np.tile(-UP, (len(u), 1))
        hits, triangle = self.surface.ray(origins, down, 2.0)
        if (triangle < 0).any():
            raise ValueError("라스트 윗면을 찾지 못한 (u, w)가 있다")
        _, normal = self.closest(hits)
        return hits + normal * offset, normal


def build_last(
    frame: FootFrame,
    points: np.ndarray,
    normals: np.ndarray,
    *,
    clearance: Callable[[np.ndarray], np.ndarray],
    cut_v: float,
    deform: Callable[[np.ndarray], np.ndarray] | None = None,
    leg_spine_top: float | None = None,
    voxel: float = 0.0026,
    smooth_iterations: int = 10,
    core_u: tuple[float, float] = (0.19, 0.72),
    extra_local: np.ndarray | None = None,
    front_cut: tuple[float, float] | None = None,
    hull_groups: list[Callable[[np.ndarray], np.ndarray]] | None = None,
) -> Last:
    """발(+종아리) 정점으로 라스트를 만든다. `clearance(v)`는 높이별 여유(m), `cut_v` 위는 자른다(다리를 감싸지 않게).

    `extra_local`(발 좌표 점)은 껍질에 더하는 디자인 부피(앞코 돔 등), `front_cut = (u0, v_max)`는 u0보다 앞쪽 점을 v_max 위에서 버린다 —
    정강이 앞 점이 남으면 볼록 껍질이 발목 앞 오목한 곳을 천막처럼 덮어 발등이 평평하게 부푼다.
    """
    from character_kit.surface import Surface, vertex_normals

    local = frame.to_local(points)
    keep = local[:, 2] <= cut_v + 0.012
    if front_cut is not None:
        keep &= ~((local[:, 0] > front_cut[0]) & (local[:, 2] > front_cut[1]))
    dilated = points[keep] + normals[keep] * clearance(local[keep, 2])[:, None]
    loc = frame.to_local(dilated)
    if deform is not None:
        loc = deform(loc)
    if extra_local is not None:
        loc = np.vstack([loc, extra_local])
    loc[:, 2] = np.minimum(loc[:, 2], cut_v)
    if hull_groups:
        # 볼록 껍질 여러 개(예: 발 | 뒤꿈치 + 다리)를 복셀 리메시로 합친다 — 발등과 정강이 사이 오목한 곳이 천막처럼 덮이지 않는다
        parts_v, parts_t = [], []
        offset = 0
        for select in hull_groups:
            group = loc[select(loc)]
            hv, ht = convex_hull(frame.to_world(group))
            parts_v.append(hv)
            parts_t.append(ht + offset)
            offset += len(hv)
        hull_positions, hull_triangles = np.concatenate(parts_v), np.concatenate(parts_t)
    else:
        hull_positions, hull_triangles = convex_hull(frame.to_world(loc))
    positions, triangles = remesh_smooth(hull_positions, hull_triangles, voxel, smooth_iterations)
    normals_out = vertex_normals(positions, triangles)
    surface = Surface(positions, triangles)
    length = frame.length
    u_a, u_b = core_u[0] * length, core_u[1] * length
    spine = [(frame.to_world(np.array([u_a, 0.0, 0.022])), frame.to_world(np.array([u_b, 0.0, 0.022])))]
    if leg_spine_top is not None:
        spine.append((frame.to_world(np.array([frame.leg[0], frame.leg[1], 0.05])), frame.to_world(np.array([frame.leg[0], frame.leg[1], leg_spine_top]))))
    return Last(frame=frame, positions=positions, triangles=triangles, normals=normals_out, surface=surface, spine=spine, core_u=(u_a, u_b))


# ---------------------------------------------------------------- 열(경기장 모양 축에서 수평 광선)

STADIUM_RADIUS = 0.035


def stadium(u_a: float, u_b: float, s: Any) -> tuple[np.ndarray, np.ndarray]:
    """열 매개변수 s(0~1, 0 = 뒤꿈치 뒤 가운데, 바깥쪽 → 발끝 → 안쪽 → 뒤 순)의 광선 원점 (u, w)와 수평 방향 (du, dw)."""
    s = np.atleast_1d(np.asarray(s, dtype=np.float64)) % 1.0
    rho = STADIUM_RADIUS
    straight = u_b - u_a
    arc = math.pi * rho
    total = 2.0 * straight + 2.0 * arc
    x = s * total
    origin = np.zeros((len(s), 2))
    alpha = np.zeros(len(s))
    b1 = arc / 2.0
    b2 = b1 + straight
    b3 = b2 + arc
    b4 = b3 + straight
    m1 = x < b1
    alpha[m1] = math.pi - x[m1] / rho
    origin[m1, 0] = u_a
    m2 = (x >= b1) & (x < b2)
    alpha[m2] = math.pi / 2.0
    origin[m2, 0] = u_a + (x[m2] - b1)
    m3 = (x >= b2) & (x < b3)
    alpha[m3] = math.pi / 2.0 - (x[m3] - b2) / rho
    origin[m3, 0] = u_b
    m4 = (x >= b3) & (x < b4)
    alpha[m4] = -math.pi / 2.0
    origin[m4, 0] = u_b - (x[m4] - b3)
    m5 = x >= b4
    alpha[m5] = -math.pi / 2.0 - (x[m5] - b4) / rho
    origin[m5, 0] = u_a
    direction = np.stack([np.cos(alpha), np.sin(alpha)], axis=1)
    return origin, direction


def stadium_s_for_u(u_a: float, u_b: float, u: float, lateral: bool) -> float:
    """발 축 직선 구간에서 원점 u가 주어진 값인 열 매개변수(바깥쪽/안쪽)."""
    rho = STADIUM_RADIUS
    straight = u_b - u_a
    arc = math.pi * rho
    total = 2.0 * straight + 2.0 * arc
    u = min(max(u, u_a), u_b)
    x = arc / 2.0 + (u - u_a) if lateral else arc / 2.0 + straight + arc + (u_b - u)
    return x / total


@dataclass
class Columns:
    """신발 한 짝의 열: 매개변수 s, 발 좌표 원점(u, w), 수평 방향."""

    s: np.ndarray
    origin: np.ndarray  # (N,2)
    direction: np.ndarray  # (N,2)

    def __len__(self) -> int:
        return len(self.s)


def make_columns(last: Last, count: int, *, toe_weight: float = 1.8, heel_weight: float = 1.4, features_u: tuple[float, ...] = (), ref_v: float = 0.016) -> Columns:
    """열 `count`개: 높이 `ref_v` 라스트 둘레를 가중 호 길이로 고르게 나눈다(발끝·뒤꿈치 곡선에 더 촘촘). `features_u`의 u에는 양옆에 열을 끼운다(허리 홈 경계 등)."""
    u_a, u_b = last.core_u
    dense_s = np.arange(1440) / 1440.0
    origin, direction = stadium(u_a, u_b, dense_s)
    ring = loop_at_height(last, origin, direction, np.full(len(dense_s), ref_v))
    rho = STADIUM_RADIUS
    straight = u_b - u_a
    arc = math.pi * rho
    total = 2.0 * straight + 2.0 * arc
    x = dense_s * total
    weight = np.ones(len(dense_s))
    weight[(x >= arc / 2.0 + straight) & (x < 1.5 * arc + straight)] = toe_weight
    weight[(x < arc / 2.0) | (x >= 1.5 * arc + 2.0 * straight)] = heel_weight
    # 가중 호 길이(3D, 닫힌 고리)를 고르게 나눠 그 위치의 s를 보간한다(s 자체를 좌표로 넣으면 닫는 구간의 s 1 → 0 점프가 표본을 잡아먹는다)
    closed_ring = np.vstack([ring, ring[:1]])
    seg = np.linalg.norm(np.diff(closed_ring, axis=0), axis=1) * 0.5 * (weight + np.append(weight[1:], weight[:1]))
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    targets = np.arange(count - 2 * len(features_u)) * cum[-1] / (count - 2 * len(features_u))
    params = np.interp(targets, cum, np.append(dense_s, 1.0))
    params = np.concatenate([params, [stadium_s_for_u(u_a, u_b, f, True) for f in features_u], [stadium_s_for_u(u_a, u_b, f, False) for f in features_u]])
    params = np.sort(params % 1.0)
    # 뒤 가운데(0)와 발끝 가운데(0.5)는 고리 대응의 기준점이라 정확히 둔다
    params[0] = 0.0
    params[int(np.argmin(np.abs(params - 0.5)))] = 0.5
    o, d = stadium(u_a, u_b, params)
    return Columns(s=params, origin=o, direction=d)


def loop_at_height(last: Last, origin_uw: np.ndarray, direction_uw: np.ndarray, heights: np.ndarray) -> np.ndarray:
    """열 원점·방향에서 높이 `heights`로 쏜 수평 광선의 라스트 출구점(월드). 원점이 라스트 밖이면 오류."""
    frame = last.frame
    origins = frame.to_world(np.stack([origin_uw[:, 0], origin_uw[:, 1], heights], axis=1))
    directions = frame.dir_to_world(np.stack([direction_uw[:, 0], direction_uw[:, 1], np.zeros(len(heights))], axis=1))
    hits, exiting = last.cast_exit(origins, directions)
    if not exiting.all():
        raise ValueError(f"라스트 밖에서 시작한 열 광선이 {int((~exiting).sum())}개 있다(높이 {float(np.min(heights)):.3f}~{float(np.max(heights)):.3f})")
    return hits


def column_reach(last: Last, columns: Columns, heights: np.ndarray) -> np.ndarray:
    """열마다 높이별 수평 도달 거리 r(v)(m). 원점이 라스트 밖인 높이는 nan. 반환 (N, H)."""
    frame = last.frame
    n, h = len(columns), len(heights)
    origin = np.repeat(columns.origin, h, axis=0)
    direction = np.repeat(columns.direction, h, axis=0)
    v = np.tile(heights, n)
    origins = frame.to_world(np.stack([origin[:, 0], origin[:, 1], v], axis=1))
    dirs = frame.dir_to_world(np.stack([direction[:, 0], direction[:, 1], np.zeros(len(v))], axis=1))
    hits, exiting = last.cast_exit(origins, dirs)
    reach = np.linalg.norm(hits - origins, axis=1)
    reach[~exiting] = np.nan
    return reach.reshape(n, h)


# ---------------------------------------------------------------- 고리띠(갑피) 이완


def annulus_on_last(last: Last, bottom: np.ndarray, top: np.ndarray, rows: int, iterations: int = 140, fixed_rows: dict[int, np.ndarray] | None = None, initial: np.ndarray | None = None) -> np.ndarray:
    """두 닫힌 고리(같은 개수, 대응 순서) 사이 고리띠 격자 (rows, N, 3)를 라스트 위에서 편다.

    초기값은 두 고리를 잇는 직선을 척추 광선으로 겉면에 들어 올린 것이고, 이후 4-이웃 라플라시안 → 최근접 투영을 반복한다(조화 사상).
    `initial`(형상 키 변형 빌드: 기본 빌드 격자)을 주면 그것을 라스트에 투영해 시작하고 이완 횟수를 줄여 정점이 표면을 따라 미끄러지지 않게 한다
    (미끄러지면 선형 morph 중간 가중치에서 정점이 곡면의 현을 지나 발 쪽으로 들어간다).
    """
    if initial is None:
        t = np.linspace(0.0, 1.0, rows)[:, None, None]
        grid = (1.0 - t) * bottom[None] + t * top[None]
        inner = grid[1:-1].reshape(-1, 3)
        grid[1:-1] = last.lift(inner).reshape(rows - 2, -1, 3)
    else:
        grid = np.array(initial, dtype=np.float64)
        grid[0], grid[-1] = bottom, top
        grid[1:-1] = last.closest(grid[1:-1].reshape(-1, 3))[0].reshape(rows - 2, -1, 3)
        iterations = min(iterations, 25)
    fixed_rows = fixed_rows or {}
    for row, values in fixed_rows.items():
        grid[row] = values
    movable = [r for r in range(1, rows - 1) if r not in fixed_rows]
    for _ in range(iterations):
        neighbours = 0.25 * (grid[:-2] + grid[2:] + np.roll(grid[1:-1], 1, axis=1) + np.roll(grid[1:-1], -1, axis=1))
        updated = 0.5 * grid[1:-1] + 0.5 * neighbours
        block = updated[[r - 1 for r in movable]].reshape(-1, 3)
        projected, _ = last.closest(block)
        grid[movable] = projected.reshape(len(movable), -1, 3)
    return grid


def resample_columns(grid: np.ndarray, fractions: np.ndarray, last: Last | None = None) -> np.ndarray:
    """격자 열마다 호 길이 비율 `fractions`(0~1, 처음 0·끝 1)로 행을 다시 고른다."""
    rows, cols, _ = grid.shape
    out = np.empty((len(fractions), cols, 3))
    for j in range(cols):
        column = grid[:, j]
        f = polyline_fractions(column)
        for k in range(3):
            out[:, j, k] = np.interp(fractions, f, column[:, k])
    if last is not None:
        inner = out[1:-1].reshape(-1, 3)
        out[1:-1] = last.closest(inner)[0].reshape(len(fractions) - 2, cols, 3)
    return out


def match_loop(bottom_loop_local: np.ndarray, top_dense_local: np.ndarray, top_back_index: int, top_front_index: int, bottom_front_index: int) -> np.ndarray:
    """아래 고리(열 순서, 0 = 뒤 가운데) 점마다 위 고리에서 대응점을 고른다: 바깥 반(뒤 → 앞)·안쪽 반(앞 → 뒤)을 각각 호 길이 비율로 맞춘다."""
    n = len(bottom_loop_local)
    lateral_b = bottom_loop_local[: bottom_front_index + 1]
    medial_b = np.vstack([bottom_loop_local[bottom_front_index:], bottom_loop_local[:1]])
    m = len(top_dense_local)
    order_lat = [(top_back_index + k) % m for k in range(((top_front_index - top_back_index) % m) + 1)]
    order_med = [(top_front_index + k) % m for k in range(((top_back_index - top_front_index) % m) + 1)]
    top_lat = top_dense_local[order_lat]
    top_med = top_dense_local[order_med]
    out = np.empty((n, 3))
    f_lat = polyline_fractions(lateral_b)
    f_top_lat = polyline_fractions(top_lat)
    for k in range(3):
        out[: bottom_front_index + 1, k] = np.interp(f_lat, f_top_lat, top_lat[:, k])
    f_med = polyline_fractions(medial_b)
    f_top_med = polyline_fractions(top_med)
    medial = np.stack([np.interp(f_med, f_top_med, top_med[:, k]) for k in range(3)], axis=1)
    out[bottom_front_index:] = medial[:-1]
    return out


# ---------------------------------------------------------------- 조각(piece)과 기본 도형


@dataclass
class Piece:
    """신발 한 조각: 월드 위치·삼각형·UV(아틀라스)·법선(없으면 조각 안에서 매끈하게 계산)."""

    name: str
    positions: np.ndarray
    triangles: np.ndarray
    uvs: np.ndarray
    normals: np.ndarray | None = None


def grid_triangles(rows: int, cols: int, wrap: bool) -> np.ndarray:
    """(rows, cols) 격자(행 우선 번호)의 사각형을 삼각형 둘로. wrap이면 마지막 열과 첫 열을 잇는다."""
    tris = []
    span = cols if wrap else cols - 1
    for r in range(rows - 1):
        for c in range(span):
            c2 = (c + 1) % cols
            a, b = r * cols + c, r * cols + c2
            d, e = (r + 1) * cols + c, (r + 1) * cols + c2
            tris += [[a, b, e], [a, e, d]]
    return np.array(tris, dtype=np.int64)


def grid_piece(name: str, grid: np.ndarray, uv_rect: "Rect", outward: Callable[[np.ndarray], np.ndarray] | None, normals_grid: np.ndarray | None = None, row_v: np.ndarray | None = None) -> Piece:
    """닫힌 고리 격자 (rows, N, 3)를 UV 이음매(열 N = 열 0 복제)가 있는 조각으로. U = 열/N, V = 행/(rows−1).

    법선은 이음매 없이(고리로 이어) 계산한 뒤 복제 열에 같은 값을 준다. `outward(points)`가 바깥 방향을 주면 감김을 그쪽으로 맞춘다.
    """
    from character_kit.surface import vertex_normals

    rows, n, _ = grid.shape
    welded = grid.reshape(-1, 3)
    raw = grid_triangles(rows, n, wrap=True)
    oriented = orient_to(welded, raw, outward) if outward is not None else raw
    flipped = bool(len(raw)) and not np.array_equal(oriented[0], raw[0])
    normals = vertex_normals(welded, oriented).reshape(rows, n, 3) if normals_grid is None else normals_grid
    positions = np.concatenate([grid, grid[:, :1]], axis=1).reshape(-1, 3)
    normal_full = np.concatenate([normals, normals[:, :1]], axis=1).reshape(-1, 3)
    u = np.tile(np.arange(n + 1) / n, rows)
    v = np.repeat(np.linspace(0.0, 1.0, rows) if row_v is None else np.asarray(row_v, dtype=np.float64), n + 1)
    uvs = uv_rect.uv(u, v)
    # 이음매 격자는 용접 격자와 사각형 순서가 같으므로 용접 격자의 뒤집힘 여부를 그대로 따른다
    seam_tris = grid_triangles(rows, n + 1, wrap=False)
    if flipped:
        seam_tris = seam_tris[:, [0, 2, 1]]
    return Piece(name=name, positions=positions, triangles=seam_tris, uvs=uvs, normals=normal_full)


def orient_to(positions: np.ndarray, triangles: np.ndarray, outward: Callable[[np.ndarray], np.ndarray]) -> np.ndarray:
    """삼각형 법선이 `outward(중심)` 방향과 대체로 같도록 전체 감김을 맞춘다(다수결)."""
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    face = np.cross(b - a, c - a)
    centers = (a + b + c) / 3.0
    agree = np.einsum("ij,ij->i", face, outward(centers))
    return triangles if float(np.sum(np.sign(agree))) >= 0 else triangles[:, [0, 2, 1]]


def orient_closed_components(positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    """연결 조각마다 부호 있는 부피가 양수가 되게 감김을 맞춘다(닫힌 관·띠)."""
    parent = list(range(len(positions)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for x, y, z in triangles.tolist():
        parent[find(y)] = find(x)
        parent[find(z)] = find(x)
    roots = np.array([find(int(i)) for i in triangles[:, 0]])
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    volume = np.einsum("ij,ij->i", a, np.cross(b, c))
    out = triangles.copy()
    for r in np.unique(roots):
        members = roots == r
        if volume[members].sum() < 0:
            out[members] = triangles[members][:, [0, 2, 1]]
    return out


def sweep(path: np.ndarray, normals: np.ndarray, profile: np.ndarray, closed: bool, cap_ends: bool = True, y_hint: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """경로를 따라 단면(2D 점, x = 법선 쪽, y = 이웃 접선 쪽)을 쓸어 닫힌 관을 만든다. 단면도 닫힌 다각형이다.

    `normals`는 경로 점마다 단면의 x축(보통 면 바깥 법선). `y_hint`를 주면 단면 y축이 그 방향과 같은 쪽을 향하게 부호를 맞춘다(경로 진행 방향과 무관하게).
    반환: 위치, 삼각형, 단면 매개변수(0~1, 경로 방향 호 길이 비율·단면 둘레 비율).
    """
    path = np.asarray(path, dtype=np.float64)
    count = len(path)
    if closed:
        tangent = unit(np.roll(path, -1, axis=0) - np.roll(path, 1, axis=0))
    else:
        tangent = unit(np.gradient(path, axis=0))
    nx = unit(normals - np.einsum("ij,ij->i", normals, tangent)[:, None] * tangent)
    ny = np.cross(tangent, nx)
    if y_hint is not None:
        hint = np.broadcast_to(np.asarray(y_hint, dtype=np.float64), ny.shape)
        if float(np.einsum("ij,ij->i", ny, hint).sum()) < 0.0:
            ny = -ny
    k = len(profile)
    rings = path[:, None, :] + profile[None, :, 0:1] * nx[:, None, :] + profile[None, :, 1:2] * ny[:, None, :]
    positions = rings.reshape(-1, 3)
    tris = []
    span = count if closed else count - 1
    for i in range(span):
        j = (i + 1) % count
        for p in range(k):
            q = (p + 1) % k
            a, b, c, d = i * k + p, i * k + q, j * k + p, j * k + q
            tris += [[a, b, d], [a, d, c]]
    along = polyline_fractions(np.vstack([path, path[:1]]) if closed else path)[:count]
    around = np.arange(k) / k
    params = np.stack([np.repeat(along, k), np.tile(around, count)], axis=1)
    if not closed and cap_ends:
        for ring_index, flip in ((0, True), (count - 1, False)):
            center = len(positions)
            positions = np.vstack([positions, path[ring_index]])
            params = np.vstack([params, [along[ring_index], 0.0]])
            for p in range(k):
                a, b = ring_index * k + p, ring_index * k + (p + 1) % k
                tris.append([center, b, a] if flip else [center, a, b])
    return positions, np.array(tris, dtype=np.int64), params


def rect_profile(width: float, thickness: float, inner: float = 0.0, round_count: int = 0) -> np.ndarray:
    """띠 단면(닫힌 다각형): x = 법선 방향(안쪽 inner ~ 바깥 inner+thickness), y = 폭 방향(±width/2)."""
    x0, x1 = inner, inner + thickness
    hw = width / 2.0
    if round_count <= 0:
        return np.array([[x0, -hw], [x1, -hw], [x1, hw], [x0, hw]])
    r = min(thickness * 0.5, hw * 0.5)
    pts = []
    for cx, cy, start in ((x1 - r, -hw + r, -math.pi / 2), (x1 - r, hw - r, 0.0)):
        for k in range(round_count + 1):
            ang = start + (math.pi / 2) * k / round_count
            pts.append([cx + r * math.cos(ang), cy + r * math.sin(ang)])
    pts = [[x0, hw]] + [[x0, -hw]] + pts
    # 순서: 안쪽 두 점 다음 바깥 둥근 모서리 → 다각형이 꼬이지 않게 각도 순으로 정렬
    pts = np.array(pts)
    center = pts.mean(axis=0)
    order = np.argsort(np.arctan2(pts[:, 1] - center[1], pts[:, 0] - center[0]))
    return pts[order]


def ellipse_profile(rx_out: float, rx_in: float, ry: float, count: int, center_x: float = 0.0) -> np.ndarray:
    """관 단면 타원(바깥쪽 반지름 rx_out, 안쪽 rx_in, 폭 반지름 ry)."""
    ang = np.linspace(0.0, 2.0 * math.pi, count, endpoint=False)
    cos = np.cos(ang)
    rx = np.where(cos >= 0.0, rx_out, rx_in)
    return np.stack([center_x + rx * cos, ry * np.sin(ang)], axis=1)


def ring_fan_cap(outer: np.ndarray, center: np.ndarray, rings: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """닫힌 바깥 고리에서 중심점까지 동심 고리 + 부채꼴로 덮개를 만든다(별 모양 다각형이어야 한다). 반환: 위치, 삼각형, 고리 비율(0 = 바깥)."""
    n = len(outer)
    layers = [outer]
    for k in range(1, rings):
        f = 1.0 - k / rings
        layers.append(center + f * (outer - center))
    positions = np.concatenate(layers)
    tris = grid_triangles(rings, n, wrap=True).tolist()
    c = len(positions)
    positions = np.vstack([positions, center])
    last = (rings - 1) * n
    for i in range(n):
        tris.append([last + i, last + (i + 1) % n, c])
    frac = np.concatenate([np.full(n, k / rings) for k in range(rings)] + [[1.0]])
    return positions, np.array(tris, dtype=np.int64), frac


def is_star_shaped(loop_2d: np.ndarray, center: np.ndarray) -> bool:
    """닫힌 2D 고리가 중심에서 본 각도로 한 방향 단조인가(부채꼴 덮개가 겹치지 않는 조건)."""
    ang = np.unwrap(np.arctan2(loop_2d[:, 1] - center[1], loop_2d[:, 0] - center[0]))
    step = np.diff(np.append(ang, ang[0] + (2 * math.pi if ang[-1] > ang[0] else -2 * math.pi)))
    return bool(np.all(step > 0) or np.all(step < 0))


def merge_pieces(pieces: list[Piece]) -> Piece:
    from character_kit.surface import vertex_normals

    positions, triangles, uvs, normals = [], [], [], []
    offset = 0
    for piece in pieces:
        positions.append(piece.positions)
        triangles.append(piece.triangles + offset)
        uvs.append(piece.uvs)
        normals.append(piece.normals if piece.normals is not None else vertex_normals(piece.positions, piece.triangles))
        offset += len(piece.positions)
    return Piece(name="+".join(p.name for p in pieces), positions=np.concatenate(positions), triangles=np.concatenate(triangles), uvs=np.concatenate(uvs), normals=np.concatenate(normals))


def drop_unused_and_degenerate(piece: Piece, min_area: float = 1e-12) -> Piece:
    """면적 0에 가까운 삼각형과 쓰이지 않는 정점을 지운다(검증기 V11 퇴화 삼각형·V20 법선 0)."""
    a, b, c = (piece.positions[piece.triangles[:, k]] for k in range(3))
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    keep = area > min_area
    tris = piece.triangles[keep]
    used = np.unique(tris)
    remap = -np.ones(len(piece.positions), dtype=np.int64)
    remap[used] = np.arange(len(used))
    return Piece(name=piece.name, positions=piece.positions[used], triangles=remap[tris], uvs=piece.uvs[used], normals=None if piece.normals is None else piece.normals[used])


# ---------------------------------------------------------------- 상대색 텍스처 아틀라스


@dataclass(frozen=True)
class Rect:
    """아틀라스의 칸(픽셀). `uv(fu, fv)`는 칸 안 비율(0~1)을 아틀라스 UV(glTF, v 아래로)로 바꾼다(가장자리 반 텍셀 안쪽)."""

    x: int
    y: int
    w: int
    h: int

    def uv(self, fu: Any, fv: Any) -> np.ndarray:
        fu = np.clip(np.asarray(fu, dtype=np.float64), 0.0, 1.0)
        fv = np.clip(np.asarray(fv, dtype=np.float64), 0.0, 1.0)
        return np.stack([(self.x + 0.5 + fu * (self.w - 1)) / ATLAS_SIZE, (self.y + 0.5 + fv * (self.h - 1)) / ATLAS_SIZE], axis=-1)


UPPER_RECT = Rect(0, 0, 1024, 448)
SOLE_RECT = Rect(0, 448, 1024, 128)
OUTSOLE_RECT = Rect(0, 576, 640, 256)
BAND_RECTS = tuple(Rect(0, 832 + 32 * k, 640, 32) for k in range(6))
PATCH_ORIGIN = (640, 576)
FOOTBED_RECT = Rect(640, 704, 384, 320)
PATCH_CELL = 24
PATCH_COLUMNS = 16


def patch_rect(index: int) -> Rect:
    """단색 칸(24 px) 번호 → 칸. 칸 가운데 8 px만 쓴다(밉맵 번짐 여유)."""
    row, col = divmod(index, PATCH_COLUMNS)
    x = PATCH_ORIGIN[0] + col * PATCH_CELL
    y = PATCH_ORIGIN[1] + row * PATCH_CELL
    return Rect(x, y, PATCH_CELL, PATCH_CELL)


def patch_uv(index: int, count: int) -> np.ndarray:
    return np.tile(patch_rect(index).uv(0.5, 0.5), (count, 1))


class ShoeAtlas:
    """휘도 아틀라스(0~1). 칸마다 굽기 함수를 받아 2×2 초표본으로 채우고 JPEG(그레이를 RGB로)로 낸다."""

    def __init__(self, fill: float = 0.9) -> None:
        self.image = np.full((ATLAS_SIZE, ATLAS_SIZE), fill, dtype=np.float64)

    def bake(self, rect: Rect, fn: Callable[[np.ndarray, np.ndarray], np.ndarray], supersample: int = 2) -> None:
        """`fn(fu, fv)`(칸 안 비율 배열) → 휘도 배열."""
        ys, xs = np.mgrid[0 : rect.h, 0 : rect.w].astype(np.float64)
        acc = np.zeros((rect.h, rect.w))
        offsets = [(k + 0.5) / supersample - 0.5 for k in range(supersample)]
        for oy in offsets:
            for ox in offsets:
                fu = np.clip((xs + ox) / max(rect.w - 1, 1), 0.0, 1.0)
                fv = np.clip((ys + oy) / max(rect.h - 1, 1), 0.0, 1.0)
                acc += fn(fu, fv)
        self.image[rect.y : rect.y + rect.h, rect.x : rect.x + rect.w] = acc / (supersample * supersample)

    def fill_patch(self, index: int, value: float) -> None:
        r = patch_rect(index)
        self.image[r.y : r.y + r.h, r.x : r.x + r.w] = value

    def jpeg(self, quality: int = 92) -> bytes:
        from PIL import Image

        gray = np.clip(self.image * 255.0 + 0.5, 0, 255).astype(np.uint8)
        buffer = io.BytesIO()
        Image.fromarray(np.stack([gray, gray, gray], axis=-1), mode="RGB").save(buffer, format="JPEG", quality=quality, subsampling=0, optimize=True)
        return buffer.getvalue()

    def mean_luminance(self) -> float:
        return float(self.image.mean())


def grid_sampler(grid_local: np.ndarray) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
    """(rows, N+1, 3) 격자(이음매 열 포함)의 (U, V) → 발 좌표 쌍선형 보간 함수."""
    rows, cols, _ = grid_local.shape

    def sample(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        x = np.clip(fu * (cols - 1), 0.0, cols - 1.000001)
        y = np.clip(fv * (rows - 1), 0.0, rows - 1.000001)
        i, j = np.floor(y).astype(int), np.floor(x).astype(int)
        a, b = (y - i)[..., None], (x - j)[..., None]
        g = grid_local
        return (1 - a) * (1 - b) * g[i, j] + a * (1 - b) * g[i + 1, j] + (1 - a) * b * g[i, j + 1] + a * b * g[i + 1, j + 1]

    return sample


def grid_arclength(grid_local: np.ndarray) -> np.ndarray:
    """격자 행마다 열 방향 누적 호 길이(m), (rows, N+1)."""
    seg = np.linalg.norm(np.diff(grid_local, axis=1), axis=2)
    return np.concatenate([np.zeros((grid_local.shape[0], 1)), np.cumsum(seg, axis=1)], axis=1)


def dashes(coordinate: np.ndarray, period: float = 0.0034, duty: float = 0.58) -> np.ndarray:
    """스티치 점선: 좌표(m)를 주기로 나눈 위상이 duty보다 작으면 1."""
    return ((np.asarray(coordinate) / period) % 1.0) < duty


# ---------------------------------------------------------------- 몸 결합·GLB 쓰기·계측


@dataclass
class BodyContext:
    """베이스 몸 표면(몸+머리, T-포즈)과 morph 델타·스킨 — 결합·계측에 같이 쓴다."""

    base: Any
    bs: Any  # retarget_garment.BodySurface
    surface: Any  # Surface(T-포즈)
    body_normals: np.ndarray
    names: list[str]


def body_context(base: Any, scope: str = "body", names: list[str] | None = None) -> BodyContext:
    """`names`를 주면 그 morph 이름들(몸·머리 어느 쪽에 있든)로, 아니면 `garment_presets.morph_names(scope)`로 만든다."""
    from character_kit.garment_presets import morph_names
    from character_kit.retarget_garment import build_body_surface
    from character_kit.surface import Surface, vertex_normals

    names = list(names) if names is not None else morph_names(scope)
    bs = build_body_surface(base, names)
    return BodyContext(base=base, bs=bs, surface=Surface(bs.tpose, bs.triangles), body_normals=vertex_normals(bs.tpose, bs.triangles), names=names)


def available_morph_names(base: Any) -> list[str]:
    """베이스 몸·머리 메시가 가진 morph 이름(계약 순서는 아니고 몸 → 머리 순, 중복 없음)."""
    out: list[str] = []
    for prefix in ("body_", "head_"):
        for name in map(str, base.mesh(prefix)["morph_names"]):
            if name not in out:
                out.append(name)
    return out


def similarity_delta(support_points: np.ndarray, support_deltas: np.ndarray, points: np.ndarray) -> np.ndarray:
    """지지 정점 델타에 최소제곱으로 맞춘 선형화 닮음 변환(이동 t + 균일 배율 s + 작은 회전 ω)을 `points`에 적용한 델타.

    d(q) = t + s·q + ω × q, q = x − 지지 중심. 아핀(12 자유도)과 달리 기울임·한 축 늘이기가 없어 단단한 소품이 찌그러지지 않는다."""
    center = support_points.mean(axis=0)
    q = support_points - center
    n = len(q)
    rows = np.zeros((3 * n, 7))
    rows[0::3, 0] = 1.0
    rows[1::3, 1] = 1.0
    rows[2::3, 2] = 1.0
    rows[0::3, 3], rows[1::3, 3], rows[2::3, 3] = q[:, 0], q[:, 1], q[:, 2]
    # ω × q = (ωy qz − ωz qy, ωz qx − ωx qz, ωx qy − ωy qx)
    rows[0::3, 5], rows[0::3, 6] = q[:, 2], -q[:, 1]
    rows[1::3, 4], rows[1::3, 6] = -q[:, 2], q[:, 0]
    rows[2::3, 4], rows[2::3, 5] = q[:, 1], -q[:, 0]
    sol, *_ = np.linalg.lstsq(rows, support_deltas.reshape(-1), rcond=None)
    t, s, w = sol[:3], sol[3], sol[4:]
    p = points - center
    return t[None, :] + s * p + np.cross(np.broadcast_to(w, p.shape), p)


def attach_rigid(ctx: BodyContext, positions: np.ndarray, joint: str, support: np.ndarray, names: list[str], label: str, fit: str = "similarity") -> dict[str, Any]:
    """단단한 소품: 스킨은 `joint` 100 %, morph는 `support`(몸+머리 정점 번호)의 델타에 최소제곱으로 맞춘 변환을 소품 정점에 적용한다.

    `fit`: `similarity`(이동·균일 배율·회전 — 기본, 모자·헤드폰·리본이 머리 크기·키·목 길이를 따라 커지고 오르내린다) 또는 `affine`(안경처럼 눈 간격에
    맞춰 한 축으로 늘어나야 하는 것). 지지 정점을 소품이 실제로 얹히는 곳(두개골 윗부분 등)으로 좁혀야 얼굴 morph가 새어 들지 않는다.
    """
    from character_kit.base_assembly import ensure_min_delta

    bs = ctx.bs
    index = ctx.base.joint_names.index(joint)
    joints = np.zeros((len(positions), 4), dtype=np.int64)
    joints[:, 0] = index
    weights = np.zeros((len(positions), 4))
    weights[:, 0] = 1.0
    support = np.asarray(support, dtype=np.int64)
    X = np.hstack([bs.tpose[support], np.ones((len(support), 1))])
    P = np.hstack([positions, np.ones((len(positions), 1))])
    deltas: dict[str, np.ndarray] = {}
    applied: list[str] = []
    for name in names:
        if fit == "affine":
            coef, *_ = np.linalg.lstsq(X, bs.morphs[name][support], rcond=None)
            delta = P @ coef
        else:
            delta = similarity_delta(bs.tpose[support], bs.morphs[name][support], positions)
        deltas[name] = ensure_min_delta(fade_small(delta), name, positions, applied, label)
    return {"joints": joints, "weights": weights, "deltas": deltas, "compatibleFraction": 1.0, "floorsApplied": applied}


def attach_surface(ctx: BodyContext, positions: np.ndarray, normals: np.ndarray, names: list[str], label: str, mode: str = "nearest", region_mask: np.ndarray | None = None) -> dict[str, Any]:
    """몸을 따라 휘는 소품: 스킨은 최근접 몸 정점(`nearest`) 또는 법선 호환 정점(`surface`), morph는 최근접 표면점 델타의 무게중심 보간.

    `region_mask`(몸+머리 정점 불 마스크)를 주면 그 정점들만 후보로 쓴다(장갑은 손, 양말은 다리 — 옆 몸통·반대 다리에 붙지 않게).
    """
    from character_kit import garment_fit as gf
    from character_kit.base_assembly import ensure_min_delta
    from character_kit.surface import Surface

    bs = ctx.bs
    if region_mask is None:
        surface, tri_map, keep = ctx.surface, np.arange(len(bs.triangles)), np.arange(len(bs.tpose))
    else:
        keep_tri = region_mask[bs.triangles].all(axis=1)
        tri_map = np.flatnonzero(keep_tri)
        surface = Surface(bs.tpose, bs.triangles[keep_tri])
        keep = np.flatnonzero(region_mask)
    if mode == "nearest":
        joints, weights = nearest_vertex_skin(positions, bs.tpose[keep], bs.joints[keep], bs.weights[keep])
    else:
        joints, weights, _ = gf.compatible_vertex_skin(positions, normals, bs.tpose, ctx.body_normals, bs.joints, bs.weights)
    hits = surface.closest(positions)
    corners = bs.triangles[tri_map[hits.triangle]]
    deltas: dict[str, np.ndarray] = {}
    applied: list[str] = []
    for name in names:
        delta = np.einsum("mc,mck->mk", hits.bary, bs.morphs[name][corners])
        deltas[name] = ensure_min_delta(fade_small(delta), name, positions, applied, label)
    return {"joints": joints, "weights": weights, "deltas": deltas, "compatibleFraction": 1.0, "floorsApplied": applied}


FADE_LO = 2e-5
FADE_HI = 6e-5


def fade_small(delta: np.ndarray) -> np.ndarray:
    magnitude = np.linalg.norm(delta, axis=1, keepdims=True)
    t = np.clip((magnitude - FADE_LO) / (FADE_HI - FADE_LO), 0.0, 1.0)
    return delta * (t * t * (3.0 - 2.0 * t))


def nearest_vertex_skin(points: np.ndarray, body_positions: np.ndarray, joints: np.ndarray, weights: np.ndarray, take: int = 4) -> tuple[np.ndarray, np.ndarray]:
    """가까운 몸 정점 `take`개의 스킨을 거리 역제곱으로 섞어 상위 4개를 남긴다(방향 무관)."""
    import bpy  # noqa: F401 — mathutils는 bpy 뒤에만 가져올 수 있다
    from mathutils import kdtree

    tree = kdtree.KDTree(len(body_positions))
    for index, position in enumerate(body_positions.tolist()):
        tree.insert(position, index)
    tree.balance()
    out_joints = np.zeros((len(points), 4), dtype=np.int64)
    out_weights = np.zeros((len(points), 4))
    for row, point in enumerate(np.asarray(points, dtype=np.float64).tolist()):
        accum: dict[int, float] = {}
        for _, idx, dist in tree.find_n(point, take):
            blend = 1.0 / (dist + 0.004) ** 2
            for j, w in zip(joints[idx].tolist(), weights[idx].tolist(), strict=True):
                if w > 0.0:
                    accum[j] = accum.get(j, 0.0) + blend * w
        ranked = sorted(accum.items(), key=lambda item: -item[1])[:4]
        norm = sum(w for _, w in ranked) or 1.0
        for slot, (j, w) in enumerate(ranked):
            out_joints[row, slot] = j
            out_weights[row, slot] = w / norm
    return out_joints, out_weights


def attach_to_body(ctx: BodyContext, positions: np.ndarray, normals: np.ndarray, label: str, rigid_joint: str | None = None, rigid_morph: bool = False, mode: str = "compatible") -> dict[str, Any]:
    """스킨(법선 호환 몸 정점 웨이트 또는 `rigid_joint` 100 %)과 morph 델타를 만든다.

    `rigid_morph`면 소품처럼 단단한 물체: 가까운 몸 정점들의 델타에 맞춘 아핀 변환을 morph마다 구해 적용한다(멀리 떠 있는 챙·컵도 머리 크기를 따라간다).
    아니면 법선 호환 최근접 몸 표면점의 델타를 무게중심으로 보간한다(밑창·갑피가 발 표면을 따라간다).
    """
    from character_kit import garment_fit as gf
    from character_kit.base_assembly import ensure_min_delta

    bs = ctx.bs
    if rigid_joint is None and mode == "nearest":
        joints, weights = nearest_vertex_skin(positions, bs.tpose[: bs.body_vertex_count], bs.joints[: bs.body_vertex_count], bs.weights[: bs.body_vertex_count])
        ratio = 1.0
    elif rigid_joint is None:
        joints, weights, ratio = gf.compatible_vertex_skin(positions, normals, bs.tpose, ctx.body_normals, bs.joints, bs.weights)
    else:
        index = ctx.base.joint_names.index(rigid_joint)
        joints = np.zeros((len(positions), 4), dtype=np.int64)
        joints[:, 0] = index
        weights = np.zeros((len(positions), 4))
        weights[:, 0] = 1.0
        ratio = 1.0
    deltas: dict[str, np.ndarray] = {}
    applied: list[str] = []
    if mode == "nearest":
        # 신발: 닫힌 관·띠의 안쪽 면(법선이 몸을 향한다)이 법선 호환 결합에서 다리 반대편 면에 붙지 않게 방향과 무관한 최근접을 쓴다
        hits = ctx.surface.closest(positions)
        corners = bs.triangles[hits.triangle]
        for name in ctx.names:
            delta = np.einsum("mc,mck->mk", hits.bary, bs.morphs[name][corners])
            deltas[name] = ensure_min_delta(fade_small(delta), name, positions, applied, label)
    elif rigid_morph:
        hits = ctx.surface.closest(positions)
        near = np.unique(bs.triangles[hits.triangle].ravel())
        # 가까운 표면 정점 주변(4 cm)까지 넓혀 아핀 맞춤이 안정되게 한다
        center = positions.mean(axis=0)
        radius = float(np.linalg.norm(positions - center, axis=1).max()) + 0.04
        ring = np.flatnonzero(np.linalg.norm(bs.tpose - center, axis=1) < radius)
        support = np.union1d(near, ring)
        X = np.hstack([bs.tpose[support], np.ones((len(support), 1))])
        for name in ctx.names:
            target = bs.morphs[name][support]
            coef, *_ = np.linalg.lstsq(X, target, rcond=None)
            delta = np.hstack([positions, np.ones((len(positions), 1))]) @ coef
            deltas[name] = ensure_min_delta(fade_small(delta), name, positions, applied, label)
    else:
        hits, _ = gf.compatible_hits(positions, normals, ctx.surface, margin=0.05, min_dot=0.2)
        corners = bs.triangles[hits.triangle]
        for name in ctx.names:
            delta = np.einsum("mc,mck->mk", hits.bary, bs.morphs[name][corners])
            deltas[name] = ensure_min_delta(fade_small(delta), name, positions, applied, label)
    return {"joints": joints, "weights": weights, "deltas": deltas, "compatibleFraction": ratio, "floorsApplied": applied}


def write_part_glb(path: Any, node: str, material: str, piece: Piece, attach: dict[str, Any], base: Any, texture_jpeg: bytes, names: list[str], merge_joints: dict[str, str] | None = None) -> int:
    """키트 파츠 GLB(스켈레톤 68 joint, 스킨 메시 한 개, morph는 정규화 SHORT + sparse, 상대색 JPEG)."""
    from pathlib import Path

    from character_kit.base_assembly import QuantizedGlbWriter
    from character_kit.glbwriter import MorphTarget, Primitive
    from character_kit.retarget_garment import merge_skin_joints

    writer = QuantizedGlbWriter(generator="toonstudio character_kit forge")
    joint_names = base.joint_names
    parents = {name: (None if parent < 0 else joint_names[parent]) for name, parent in zip(joint_names, base.joint_parents, strict=True)}
    writer.add_skeleton(joint_names, parents, base.arrays["joint_tpose"].astype(np.float64))
    texture = writer.add_texture(texture_jpeg, "image/jpeg", name=f"{material}_basecolor")
    material_index = writer.add_material(material, base_color_texture=texture, base_color_factor=(1.0, 1.0, 1.0, 1.0), double_sided=True, metallic=0.0, roughness=0.8)
    joints, weights = merge_skin_joints(np.asarray(attach["joints"]), np.asarray(attach["weights"]), joint_names, merge_joints or {})
    targets = [MorphTarget(name=name, position=attach["deltas"][name].astype(np.float32)) for name in names]
    normals = unit(piece.normals)
    writer.add_mesh_node(
        node,
        [
            Primitive(
                positions=piece.positions.astype(np.float32),
                indices=piece.triangles.astype(np.uint32),
                normals=normals.astype(np.float32),
                uvs=piece.uvs.astype(np.float32),
                joints=joints.astype(np.uint8),
                weights=weights.astype(np.float32),
                material=material_index,
                targets=targets,
            )
        ],
        skinned=True,
    )
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return writer.write(str(path))


def penetration_report(ctx: BodyContext, piece: Piece, region_names: tuple[str, ...], depth: float = 0.02) -> dict[str, Any]:
    """몸 정점에서 법선 반대(안쪽)로 쏜 광선이 `depth` 안에서 신발 면을 맞히면 신발이 피부 안으로 들어간 것이다. 개수와 최대 깊이를 잰다."""
    from character_kit.surface import Surface

    base = ctx.base
    body = base.mesh("body_")
    mask = np.isin(body["region"], [base.region_ids.index(n) for n in region_names])
    points = body["tpose_positions"].astype(np.float64)[mask]
    normals = unit(body["normals"].astype(np.float64)[mask])
    shoe = Surface(piece.positions, piece.triangles)
    hits, triangle = shoe.ray(points - normals * 1e-4, -normals, depth)
    # 광선이 몸을 먼저 빠져나가면(발가락 사이 면처럼 법선이 옆 발가락을 향한 정점) 그 너머의 신발은 관통이 아니다
    body_hits, body_triangle = ctx.surface.ray(points - normals * 3e-4, -normals, depth)
    body_exit = np.where(body_triangle >= 0, np.linalg.norm(body_hits - points, axis=1), np.inf)
    shoe_dist = np.linalg.norm(hits - points, axis=1)
    inside = (triangle >= 0) & (shoe_dist < body_exit)
    deepest = float(shoe_dist[inside].max()) if inside.any() else 0.0
    return {"checked": int(len(points)), "inside": int(inside.sum()), "maxDepthMm": round(deepest * 1000, 2)}


def clearance_report(ctx: BodyContext, piece: Piece) -> dict[str, Any]:
    """신발 정점의 몸 표면 부호 거리(바깥 +) 분포(mm)."""
    from character_kit import garment_fit as gf

    d, _, _ = gf.signed_distance(piece.positions, ctx.surface, ctx.body_normals)
    return {"minMm": round(float(d.min()) * 1000, 2), "p01Mm": round(float(np.percentile(d, 1)) * 1000, 2), "medianMm": round(float(np.median(d)) * 1000, 2)}


# ---------------------------------------------------------------- 표면을 따르는 얇은 띠·패널(스트랩·혀·아일릿 띠)

Projector = Callable[[np.ndarray], tuple[np.ndarray, np.ndarray]]


def last_projector(last: Last) -> Projector:
    return last.closest


def body_projector(ctx: "BodyContext") -> Projector:
    """몸(T-포즈) 최근접 표면점과 정점 법선 보간(매끈한 법선)."""

    def project(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        hits = ctx.surface.closest(np.asarray(points, dtype=np.float64))
        corners = ctx.bs.triangles[hits.triangle]
        return hits.point, unit(np.einsum("mc,mck->mk", hits.bary, ctx.body_normals[corners]))

    return project


def surface_band(
    name: str,
    project: Projector,
    path: np.ndarray,
    half_width: Any,
    thickness: Any,
    inner: Any,
    across: int,
    uv_rect: Rect,
    band_length: float = 0.40,
    end_round: tuple[float, float] = (0.0, 0.0),
    crown: float = 0.0,
    closed: bool = False,
) -> Piece:
    """경로(월드, 대략 표면 위)를 따라 표면에 붙는 닫힌 얇은 띠(위·아래 면 + 옆면 + 끝면).

    `half_width`·`thickness`·`inner`는 스칼라 또는 경로 점마다의 배열(m). `inner`는 표면에서 띠 아랫면까지, 윗면은 inner + thickness.
    `end_round`(시작, 끝 길이 m)만큼 끝을 반원으로 줄인다. `crown`은 가운데를 부풀리는 양(m, 패드 느낌). UV는 길이 방향 호 길이/`band_length`, 폭 방향 0~1.
    """
    path = np.asarray(path, dtype=np.float64)
    n = len(path)
    hw = np.broadcast_to(np.asarray(half_width, dtype=np.float64), (n,)).copy()
    th = np.broadcast_to(np.asarray(thickness, dtype=np.float64), (n,)).copy()
    inn = np.broadcast_to(np.asarray(inner, dtype=np.float64), (n,)).copy()
    centers, normals = project(path)
    tangent = unit(np.roll(centers, -1, axis=0) - np.roll(centers, 1, axis=0)) if closed else unit(np.gradient(centers, axis=0))
    side = unit(np.cross(normals, tangent))
    seg = np.linalg.norm(np.diff(centers, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    total = s[-1]
    r0, r1 = end_round
    if r0 > 0:
        t = np.clip((s - 0.0) / r0, 0.0, 1.0)
        hw *= np.maximum(np.sqrt(1.0 - (1.0 - t) ** 2), 0.28)
    if r1 > 0:
        t = np.clip((total - s) / r1, 0.0, 1.0)
        hw *= np.maximum(np.sqrt(1.0 - (1.0 - t) ** 2), 0.28)
    fractions = np.linspace(-1.0, 1.0, across)
    grid_points = centers[:, None, :] + (hw[:, None] * fractions[None, :])[:, :, None] * side[:, None, :]
    on, nrm = project(grid_points.reshape(-1, 3))
    on = on.reshape(n, across, 3)
    nrm = nrm.reshape(n, across, 3)
    bulge = crown * (1.0 - fractions**2)[None, :]
    top = on + (inn[:, None] + th[:, None] + bulge)[:, :, None] * nrm
    bottom = on + inn[:, None, None] * nrm
    positions = np.concatenate([top.reshape(-1, 3), bottom.reshape(-1, 3)])
    m = n * across
    tris: list[list[int]] = []
    span = n if closed else n - 1
    for i in range(span):
        i2 = (i + 1) % n
        for j in range(across - 1):
            a, b, c, d = i * across + j, i * across + j + 1, i2 * across + j, i2 * across + j + 1
            tris += [[a, b, d], [a, d, c]]
            tris += [[m + a, m + d, m + b], [m + a, m + c, m + d]]
    for i in range(span):  # 옆면(폭 양 끝)
        i2 = (i + 1) % n
        for j in (0, across - 1):
            a, c = i * across + j, i2 * across + j
            tris += [[a, c, m + c], [a, m + c, m + a]] if j == 0 else [[a, m + a, m + c], [a, m + c, c]]
    if not closed:
        for i in (0, n - 1):  # 끝면
            for j in range(across - 1):
                a, b = i * across + j, i * across + j + 1
                tris += [[a, m + a, m + b], [a, m + b, b]] if i == 0 else [[a, b, m + b], [a, m + b, m + a]]
    triangles = orient_closed_components(positions, np.array(tris, dtype=np.int64))
    fu = np.concatenate([np.repeat(s / band_length, across)] * 2)
    fv = np.concatenate([np.tile((fractions + 1.0) / 2.0, n)] * 2)
    return Piece(name=name, positions=positions, triangles=triangles, uvs=uv_rect.uv(fu, fv))


def ribbon_sweep(name: str, path: np.ndarray, normals: np.ndarray, width: float, thickness: float, closed: bool, uv: np.ndarray | Rect, band_length: float = 0.40) -> Piece:
    """납작한 사각 단면(폭 × 두께) 관: 신발끈·리본 고리. `uv`가 Rect면 길이 방향 호 길이로, 배열이면 그 UV 하나를 모든 정점에 쓴다."""
    profile = np.array([[-thickness / 2, -width / 2], [thickness / 2, -width / 2], [thickness / 2, width / 2], [-thickness / 2, width / 2]])
    positions, triangles, params = sweep(path, normals, profile, closed=closed, cap_ends=not closed)
    triangles = orient_closed_components(positions, triangles)
    if isinstance(uv, Rect):
        seg = np.linalg.norm(np.diff(path, axis=0), axis=1)
        length = float(seg.sum())
        uvs = uv.uv(params[:, 0] * length / band_length, np.full(len(params), 0.5))
    else:
        uvs = np.tile(np.asarray(uv, dtype=np.float64).reshape(1, 2), (len(positions), 1))
    return Piece(name=name, positions=positions, triangles=triangles, uvs=uvs)


# ---------------------------------------------------------------- 닫힌 신발(스니커즈·로퍼·부츠) 매개변수


@dataclass(frozen=True)
class ShoeParams:
    """형상 키(`shape:*`)가 바꾸는 값. 기본값에서 ± 변형한 빌드끼리 정점 순서가 같으므로 위치 차가 형상 키 델타다."""

    collar_back: float  # 칼라(입구) 뒤 높이 v. 부츠는 목둘레 고리 뒤 높이
    collar_side: float  # 칼라 옆(복사뼈 아래) 높이
    throat_u: float  # 입구 앞끝(혀 자리)의 u/L — 그 높이는 라스트 윗면에서 잰다(낮은 신발)
    sole_thickness: float  # 볼 아래 밑창 두께(땅 = −두께)
    toe_extension: float  # 발끝 너머 앞코 길이
    toe_box_height: float  # 앞코 돔 꼭대기 v
    toe_box_half_width: float  # 앞코 돔 반폭
    toe_plan_exponent: float  # 앞코 평면 모양: 2 둥근, > 2 각진, < 2 뾰족(아몬드)
    toe_spring: float  # 앞코 바닥 들림
    collar_front: float | None = None  # 부츠 목둘레 앞 높이(None이면 낮은 신발: throat_u의 라스트 윗면 높이)


@dataclass(frozen=True)
class ShoeStyle:
    """스타일 고정값(형상 키와 무관)."""

    name: str
    kind: str  # "low" | "boot"
    clearance: float
    shaft_clearance: float
    cut_v: float
    columns: int
    rows: int
    sole_margin: float
    sole_top_side: float
    sole_top_toe: float
    sole_top_heel: float
    bevel: float
    top_round: float
    tuck: float
    shank_recess: float
    heel_breast: float  # u/L: 굽 앞면(허리 홈 시작)
    ball: float  # u/L: 허리 홈 끝
    collar_pad: tuple[float, float, float] | None  # (바깥 rx, 안쪽 rx, ry) m
    sole_middle_points: int = 5
    bevel_rows: int = 3
    insole: bool = False
    smooth_iterations: int = 10
    dome_front_length: float = 0.060  # 앞코 돔 중심에서 앞끝까지
    dome_back_length: float = 0.07  # 앞코 돔이 발등 쪽으로 이어지는 길이
    dome_vertical_exponent: float = 2.6  # 2 = 타원 단면, 클수록 위·옆이 각진 상자형


@dataclass
class ShoeLayout:
    """기본 빌드에서 정한 표본 위치(형상 키 변형 빌드가 같은 위상을 갖도록 재사용)와 기본 갑피 격자(발 좌표, 변형 빌드의 이완 시작점)."""

    columns: Columns
    upper_local: np.ndarray | None = None


def _se(x: np.ndarray, n: float) -> np.ndarray:
    return np.sign(x) * np.abs(x) ** (2.0 / n)


def toe_dome_points(frame: FootFrame, params: ShoeParams, style: ShoeStyle) -> np.ndarray:
    """앞코 돔(초타원체, 발 좌표 점들). 앞쪽 반은 길이 `dome_front_length`로 발끝 + 연장까지 가고 위·옆이 각진 초타원(지수 2.6)이라
    앞에서 가파르게 솟고 위가 평평한 앞코가 된다. 뒤쪽 반은 발등으로 낮게 이어진다. 볼록 껍질에 더해 둥근 앞코 부피를 만든다."""
    length = frame.length
    tip = length + params.toe_extension
    a_front = style.dome_front_length
    a_back = style.dome_back_length
    center_u = tip - a_front
    center_w = -0.004
    theta = np.linspace(-math.pi, math.pi, 61)
    phi = np.linspace(-0.12, math.pi / 2, 16)
    th, ph = np.meshgrid(theta, phi, indexing="ij")
    r = _se(np.cos(ph), style.dome_vertical_exponent)
    cu = _se(np.cos(th), params.toe_plan_exponent)
    a_u = np.where(cu >= 0.0, a_front, a_back)
    u = center_u + a_u * cu * r
    w = center_w + params.toe_box_half_width * _se(np.sin(th), params.toe_plan_exponent) * r
    # 뒤쪽 반은 발등 쪽으로 갈수록 낮아진다(앞코만 둥글게 부풀린다)
    height = params.toe_box_height * np.where(cu >= 0.0, 1.0, 1.0 + 0.30 * cu)
    v = height * _se(np.sin(ph), style.dome_vertical_exponent)
    return np.stack([u.ravel(), w.ravel(), v.ravel()], axis=1)


def toe_deform(frame: FootFrame, params: ShoeParams, style: ShoeStyle) -> Callable[[np.ndarray], np.ndarray]:
    """라스트 점(발 좌표): 발가락 앞부분을 앞코 연장만큼 늘린다(발가락 끝이 돔 앞까지 가도록 부드럽게)."""
    length = frame.length

    def deform(local: np.ndarray) -> np.ndarray:
        out = local.copy()
        u = out[:, 0]
        u0 = 0.60 * length
        t = (u - u0) / (length - u0)
        e = params.toe_extension
        out[:, 0] = u + np.where(t <= 0.0, 0.0, np.where(t <= 1.0, e * t * t, e * (1.0 + 2.0 * (t - 1.0))))
        return out

    return deform


def sole_bottom_v(u: np.ndarray, frame: FootFrame, params: ShoeParams, style: ShoeStyle) -> np.ndarray:
    """바닥 높이 v(u): 평평(−두께) + 허리 홈(굽 앞면에서 4 mm 안에 오르고 볼 쪽으로 내려감) + 앞코 들림."""
    length = frame.length
    hb, ball = style.heel_breast * length, style.ball * length
    rise = smoothstep(hb, hb + 0.004, u) * (1.0 - smoothstep(hb + 0.45 * (ball - hb), ball, u))
    tip = length + params.toe_extension
    spring = smoothstep(length - 0.055, tip + 0.004, u) ** 1.7
    return -params.sole_thickness + style.shank_recess * rise + params.toe_spring * spring


def sole_top_v(u: np.ndarray, frame: FootFrame, params: ShoeParams, style: ShoeStyle) -> np.ndarray:
    """밑창 옆벽 윗선 높이 v(u): 옆 → 앞코 범퍼·뒤꿈치에서 높아진다."""
    length = frame.length
    tip = length + params.toe_extension
    toe = smoothstep(0.78 * length, tip - 0.012, u)
    heel = 1.0 - smoothstep(0.05 * length, 0.26 * length, u)
    return style.sole_top_side + (style.sole_top_toe - style.sole_top_side) * toe + (style.sole_top_heel - style.sole_top_side) * heel


def make_shoe_last(frame: FootFrame, base: Any, style: ShoeStyle, params: ShoeParams) -> Last:
    regions = (f"foot.{frame.side}", f"calf.{frame.side}")
    points, normals = body_region_vertices(base, regions)

    def clearance(v: np.ndarray) -> np.ndarray:
        return style.clearance + (style.shaft_clearance - style.clearance) * smoothstep(0.07, 0.11, v)

    front_cut = None
    hull_groups = None
    if style.kind == "low":
        # 발목 앞(입구 앞끝)보다 위의 정강이 점을 버려 발등 천막을 없앤다
        front_cut = (frame.leg[0] + 0.012, params.collar_back + 0.012)
    else:
        leg_u = float(frame.leg[0])
        # 발 | 뒤꿈치·발목 | 정강이 띠 둘: 띠마다 볼록이라 목이 다리를 따라 위로 가늘어진다(껍질 하나면 복사뼈 폭 그대로 올라가 양동이 같은 목이 된다)
        hull_groups = [
            lambda loc: (loc[:, 0] >= leg_u - 0.015) & (loc[:, 2] <= 0.088),
            lambda loc: (loc[:, 0] <= leg_u + 0.050) & (loc[:, 2] <= 0.080),
            lambda loc: (loc[:, 2] >= 0.062) & (loc[:, 2] <= 0.120),
            lambda loc: loc[:, 2] >= 0.105,
        ]
    # 자름 높이는 칼라보다 충분히 위(평활이 자른 뚜껑 가장자리를 안쪽으로 둥글린다 — 칼라가 그 근처면 패드가 다리에 닿는다).
    # 낮은 신발은 입구 앞(혀 자리)이 뒤보다 2 cm쯤 높다
    cut_v = max(style.cut_v, params.collar_back + 0.050, (params.collar_front or 0.0) + 0.040)
    return build_last(
        frame,
        points,
        normals,
        clearance=clearance,
        cut_v=cut_v,
        deform=toe_deform(frame, params, style),
        leg_spine_top=cut_v - 0.012 if style.kind == "boot" else None,
        smooth_iterations=style.smooth_iterations,
        extra_local=toe_dome_points(frame, params, style),
        front_cut=front_cut,
        hull_groups=hull_groups,
    )


@dataclass
class SoleResult:
    wall: Piece
    bottom: Piece
    bottom_loop: np.ndarray  # 갑피 아래 고리(월드, 열 순서)
    wall_grid_local: np.ndarray  # (K, N+1, 3) 옆벽 격자(발 좌표, 이음매 포함) — 텍스처 굽기
    top_v: np.ndarray  # 열마다 옆벽 윗선
    ground_v: float  # 바닥 최저 v
    row_v: np.ndarray | None = None  # 옆벽 행 V(텍스처)


def build_sole(last: Last, columns: Columns, params: ShoeParams, style: ShoeStyle) -> SoleResult:
    """열마다 라스트 단면의 최대 폭 높이까지 수직 벽, 그 위는 라스트를 따라 `sole_top_v`까지 감싸고 둥글게 말아 윗 턱으로 들어간다. 바닥은 동심 고리 덮개."""
    frame = last.frame
    n = len(columns)
    heights = np.arange(-0.006, 0.07, 0.0015)
    reach = column_reach(last, columns, heights)
    ref_points = loop_at_height(last, columns.origin, columns.direction, np.full(n, 0.016))
    ref_u = frame.to_local(ref_points)[:, 0]
    top = sole_top_v(ref_u, frame, params, style)
    m = style.sole_margin
    tr = min(style.top_round, m - 0.0006)
    profiles = []
    for i in range(n):
        valid = ~np.isnan(reach[i])
        hv, rv = heights[valid], reach[i][valid]
        vt = float(top[i])
        if vt > hv.max() - 0.001:
            vt = float(hv.max() - 0.001)
            top[i] = vt

        def r_at(v: float, hv=hv, rv=rv) -> float:
            return float(np.interp(v, hv, rv))

        # 벽 위치 = 밑창 윗선 + 1.5 cm 안에서 라스트가 가장 멀리 나간 거리(평면 실루엣) + 여유: 갑피가 밑창 밖으로 튀어나오지 않고, 볼록한 라스트라
        # 열마다의 최대 도달 거리가 볼록 윤곽 = 바닥 고리가 별 모양이 된다. 그 높이보다 위(발가락 범퍼)는 라스트를 따라 안쪽으로 감싼다.
        reach_zone = hv <= vt + 0.015
        k_max = int(np.argmax(np.where(reach_zone, rv, -np.inf)))
        r_wall = float(rv[k_max]) + m
        v_star = min(float(hv[k_max]), vt - tr)
        # 바닥 높이는 옆벽 바닥 점의 u에서 잰다
        o, d = columns.origin[i], columns.direction[i]
        u_bottom = o[0] + (r_wall - style.bevel) * d[0]
        vb = float(sole_bottom_v(np.array([u_bottom]), frame, params, style)[0])
        b = style.bevel
        bevel = [(r_wall - b, vb), (r_wall - b * (1 - math.sin(math.pi / 4)), vb + b * (1 - math.cos(math.pi / 4))), (r_wall, vb + b)]
        if style.bevel_rows == 2:
            bevel = [bevel[0], bevel[2]]
        middle = [(r_wall, max(vb + b + 0.0005, v_star))]
        for k in range(1, 6):
            v = v_star + (vt - tr - v_star) * k / 5.0
            if v > middle[-1][1] + 1e-4:
                middle.append((max(r_at(v) + m, 0.0), v))
        mid_line = np.array([bevel[-1], *middle])
        mid_res = resample_polyline(mid_line, style.sole_middle_points + 1)[1:]
        rt = r_at(vt)
        center = (rt + m - tr, vt - tr)
        round_pts = [(center[0] + tr * math.cos(a), center[1] + tr * math.sin(a)) for a in (math.radians(35), math.radians(70), math.radians(90))]
        ledge = [(rt + 0.0004, vt)]
        profile = np.array([*bevel, *[tuple(p) for p in mid_res], *round_pts, *ledge])
        profiles.append(profile)
    k = len(profiles[0])
    local = np.zeros((k, n, 3))
    for i, profile in enumerate(profiles):
        o, d = columns.origin[i], columns.direction[i]
        local[:, i, 0] = o[0] + profile[:, 0] * d[0]
        local[:, i, 1] = o[1] + profile[:, 0] * d[1]
        local[:, i, 2] = profile[:, 1]
    world = frame.to_world(local)

    def outward(points: np.ndarray) -> np.ndarray:
        return unit(points - last.spine_origin(points))

    # 행 V: 열마다 단면 호 길이 비율의 중앙값(눈에 보이는 옆면에 텍스처 해상도를 고르게 준다)
    seg = np.linalg.norm(np.diff(local, axis=0), axis=2)
    frac = np.concatenate([np.zeros((1, n)), np.cumsum(seg, axis=0)], axis=0) / np.maximum(seg.sum(axis=0), 1e-9)
    row_v = np.median(frac, axis=1)
    row_v = np.maximum.accumulate(np.clip(row_v, 0.0, 1.0))
    row_v[-1] = 1.0
    wall = grid_piece("sole-wall", world, SOLE_RECT, outward, row_v=row_v)
    # 바닥 덮개: 바깥 고리 = 옆벽 첫 고리(모따기 시작), 발 좌표 (u, w)에서 동심 고리
    ring = local[0, :, :2]
    center = ring.mean(axis=0)
    if not is_star_shaped(ring, center):
        center = np.array([0.5 * (ring[:, 0].min() + ring[:, 0].max()), float(np.median(ring[:, 1]))])
        if not is_star_shaped(ring, center):
            raise ValueError("밑창 바닥 고리가 중심에서 별 모양이 아니다(부채꼴 덮개를 만들 수 없다)")
    cap_uv, cap_tris, _ = ring_fan_cap(ring, center, rings=2)
    cap_v = sole_bottom_v(cap_uv[:, 0], frame, params, style)
    cap_v[: len(ring)] = local[0, :, 2]
    cap_local = np.stack([cap_uv[:, 0], cap_uv[:, 1], cap_v], axis=1)
    cap_world = frame.to_world(cap_local)
    cap_tris = orient_to(cap_world, cap_tris, lambda c: np.tile(-UP, (len(c), 1)))
    fu = (cap_local[:, 0] - OUTSOLE_U_RANGE[0]) / (OUTSOLE_U_RANGE[1] - OUTSOLE_U_RANGE[0])
    fv = (cap_local[:, 1] - OUTSOLE_W_RANGE[0]) / (OUTSOLE_W_RANGE[1] - OUTSOLE_W_RANGE[0])
    bottom = Piece(name="sole-bottom", positions=cap_world, triangles=cap_tris, uvs=OUTSOLE_RECT.uv(fu, fv), normals=np.tile(-UP, (len(cap_world), 1)))
    # 아래 고리: 열 원점이 라스트 안인 가장 낮은 높이 + 2 mm 위로(뒤꿈치·아치는 발바닥이 떠 있어 얇은 밑창에서 원점이 라스트 밑으로 빠진다)
    lowest = np.array([float(heights[~np.isnan(reach[i])][0]) for i in range(n)])
    join = np.maximum(top - style.tuck, lowest + 0.002)
    bottom_loop = loop_at_height(last, columns.origin, columns.direction, join)
    wall_local = np.concatenate([local, local[:, :1]], axis=1)
    return SoleResult(wall=wall, bottom=bottom, bottom_loop=bottom_loop, wall_grid_local=wall_local, top_v=top, ground_v=float(cap_local[:, 2].min()), row_v=row_v)


OUTSOLE_U_RANGE = (-0.02, 0.29)
OUTSOLE_W_RANGE = (-0.075, 0.075)


def collar_loop(last: Last, axis_uw: np.ndarray, heights: Callable[[np.ndarray], np.ndarray], count: int = 720) -> np.ndarray:
    """발목 축(발 좌표 (u, w))에서 각도 φ(π = 뒤, 바깥쪽 → 앞 → 안쪽 순)마다 높이 heights(φ)로 쏜 수평 광선의 라스트 출구점(월드). 0번 = 뒤, count/2번 = 앞."""
    phi = math.pi - np.arange(count) * (2.0 * math.pi / count)
    v = heights(phi)
    origin = np.tile(axis_uw, (count, 1))
    direction = np.stack([np.cos(phi), np.sin(phi)], axis=1)
    return loop_at_height(last, origin, direction, v)


def collar_heights(back: float, side: float, front: float, sharp: float = 1.0) -> Callable[[np.ndarray], np.ndarray]:
    """φ별 칼라 높이: 뒤(φ = π) back, 옆(±π/2) side, 앞(0) front 사이를 cos 가중으로 잇는다."""

    def heights(phi: np.ndarray) -> np.ndarray:
        c = np.cos(phi)
        wb = np.maximum(-c, 0.0) ** sharp
        wf = np.maximum(c, 0.0) ** sharp
        return wb * back + wf * front + (1.0 - wb - wf) * side

    return heights


def build_upper(last: Last, columns: Columns, sole: SoleResult, collar_dense: np.ndarray, rows: int, initial_local: np.ndarray | None = None) -> tuple[Piece, np.ndarray, np.ndarray]:
    """갑피 고리띠: 아래 고리(밑창 안) ~ 칼라 고리. 반환: 조각, 격자(월드, rows × N), 칼라 대응점(N)."""
    frame = last.frame
    n = len(columns)
    front_index = int(np.argmin(np.abs(columns.s - 0.5)))
    matched = match_loop(frame.to_local(sole.bottom_loop), frame.to_local(collar_dense), 0, len(collar_dense) // 2, front_index)
    top = frame.to_world(matched)
    initial = None if initial_local is None else frame.to_world(initial_local)
    grid = annulus_on_last(last, sole.bottom_loop, top, rows, initial=initial)

    def outward(points: np.ndarray) -> np.ndarray:
        return last.normal_at(points)

    piece = grid_piece("upper", grid, UPPER_RECT, outward)
    return piece, grid, top


def shoe_collar(last: Last, params: ShoeParams, sharp: float = 1.0) -> tuple[np.ndarray, float]:
    """입구(칼라) 조밀 고리(월드, 720점: 0 = 뒤, 360 = 앞)와 앞 높이. 낮은 신발은 throat_u 위치의 라스트 윗면 높이를 앞 높이로 쓴다."""
    frame = last.frame
    if params.collar_front is None:
        point, _ = last.top_point([params.throat_u * frame.length], [frame.leg[1]])
        front = float(frame.to_local(point)[0, 2]) - 0.002
    else:
        front = params.collar_front
    return collar_loop(last, frame.leg, collar_heights(params.collar_back, params.collar_side, front, sharp)), front


# ---------------------------------------------------------------- 닫힌 신발 조립(공통)

#: 확장 프로필의 재질 역할(계약 변경 제안): 갑피 / 밑창 / 끈·버클·포인트
ROLE_UPPER = "shoes"
ROLE_SOLE = "shoes-sole"
ROLE_ACCENT = "shoes-lace"
SHOE_ROLES = (ROLE_UPPER, ROLE_SOLE, ROLE_ACCENT)


@dataclass
class ShoeBuild:
    """신발 한 짝 빌드 결과: 역할 붙은 조각들과 텍스처 굽기에 쓰는 발 좌표 격자."""

    side: str
    pieces: list[tuple[str, Piece]]  # (역할, 조각)
    upper_local: np.ndarray | None  # (rows, N+1, 3)
    sole_local: np.ndarray | None  # (K, N+1, 3)
    ground_v: float
    sole_row_v: np.ndarray | None = None
    info: dict[str, Any] = field(default_factory=dict)


def collar_pad_piece(name: str, last: Last, path: np.ndarray, pad: tuple[float, float, float], uv: np.ndarray, segments: int = 6, samples: int = 34) -> Piece:
    """칼라 패딩: 입구 가장자리를 따라 도는 타원 관(바깥 rx·안쪽 rx·높이 ry). 가장자리를 덮도록 단면 중심을 조금 아래(신발 안쪽 방향)로 둔다."""
    rx_out, rx_in, ry = pad
    path = resample_polyline(path, samples, closed=True)
    path, _ = last.closest(path)
    _, normals = last.closest(path)
    ang = np.linspace(0.0, 2.0 * math.pi, segments, endpoint=False) + math.pi / segments
    cos = np.cos(ang)
    profile = np.stack([0.0004 + np.where(cos >= 0.0, rx_out, rx_in) * cos, -0.0012 + ry * np.sin(ang)], axis=1)
    positions, triangles, _ = sweep(path, normals, profile, closed=True, y_hint=UP)
    triangles = orient_closed_components(positions, triangles)
    return Piece(name=name, positions=positions, triangles=triangles, uvs=np.tile(uv.reshape(1, 2), (len(positions), 1)))


def lace_path(last: Last, a_uw: np.ndarray, b_uw: np.ndarray, end_offset: float, arch: float, count: int) -> tuple[np.ndarray, np.ndarray]:
    """두 아일릿(발 좌표 u, w) 사이 신발끈 경로: 라스트 윗면 위 offset(t) = end_offset + arch·sin(πt). 반환: 위치, 법선(월드)."""
    t = np.linspace(0.0, 1.0, count)
    uw = (1.0 - t)[:, None] * a_uw[None] + t[:, None] * b_uw[None]
    points, normals = last.top_point(uw[:, 0], uw[:, 1])
    offset = end_offset + arch * np.sin(math.pi * t)
    return points + normals * offset[:, None], normals


def grid_fields(grid_local: np.ndarray, row_v: np.ndarray | None = None) -> Callable[[np.ndarray, np.ndarray], dict[str, np.ndarray]]:
    """격자(rows, N+1, 3, 발 좌표)의 텍셀 (U, V) → 굽기 입력: 발 좌표, 열 방향 아래·위 가장자리까지 거리(m), 행 방향 호 길이(m).
    `row_v`는 행마다의 V(조각 UV와 같은 값, 없으면 균등)."""
    rows, cols, _ = grid_local.shape
    base_sample = grid_sampler(grid_local)
    if row_v is not None:
        rv = np.asarray(row_v, dtype=np.float64)

        def remap(fv: np.ndarray) -> np.ndarray:
            return np.interp(fv, rv, np.linspace(0.0, 1.0, rows))
    else:

        def remap(fv: np.ndarray) -> np.ndarray:
            return fv

    def sample(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        return base_sample(fu, remap(fv))
    column_len = np.concatenate([np.zeros((1, cols)), np.cumsum(np.linalg.norm(np.diff(grid_local, axis=0), axis=2), axis=0)], axis=0)
    total = np.tile(column_len[-1], (rows, 1))
    along = grid_arclength(grid_local)

    def interp(table: np.ndarray, fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        x = np.clip(fu * (cols - 1), 0.0, cols - 1.000001)
        y = np.clip(fv * (rows - 1), 0.0, rows - 1.000001)
        i, j = np.floor(y).astype(int), np.floor(x).astype(int)
        a, b = y - i, x - j
        return (1 - a) * (1 - b) * table[i, j] + a * (1 - b) * table[i + 1, j] + (1 - a) * b * table[i, j + 1] + a * b * table[i + 1, j + 1]

    def fields(fu: np.ndarray, fv_raw: np.ndarray) -> dict[str, np.ndarray]:
        local = sample(fu, fv_raw)
        fv = remap(fv_raw)
        from_bottom = interp(column_len, fu, fv)
        top_v = interp(np.tile(grid_local[-1, :, 2], (rows, 1)), fu, fv)
        bottom_v = interp(np.tile(grid_local[0, :, 2], (rows, 1)), fu, fv)
        return {
            "top_v": top_v,
            "bottom_v": bottom_v,
            "u": local[..., 0],
            "w": local[..., 1],
            "v": local[..., 2],
            "from_bottom": from_bottom,
            "to_top": interp(total, fu, fv) - from_bottom,
            "along": interp(along, fu, fv),
            "fu": fu,
            "fv": fv,
        }

    return fields


def bake_upper(atlas: ShoeAtlas, upper_local: np.ndarray, design: Callable[[dict[str, np.ndarray]], np.ndarray]) -> None:
    """갑피 칸: 텍셀 (U, V) → 왼발 격자 보간 발 좌표·가장자리 거리·호 길이를 design에 넘긴다."""
    fields = grid_fields(upper_local)
    atlas.bake(UPPER_RECT, lambda fu, fv: design(fields(fu, fv)))


def bake_sole_wall(atlas: ShoeAtlas, sole_local: np.ndarray, design: Callable[[dict[str, np.ndarray]], np.ndarray], row_v: np.ndarray | None = None) -> None:
    """밑창 옆벽 칸: 갑피와 같은 입력(아래 = 모따기 시작, 위 = 윗 턱 안쪽 끝)."""
    fields = grid_fields(sole_local, row_v)
    atlas.bake(SOLE_RECT, lambda fu, fv: design(fields(fu, fv)))


def bake_outsole(atlas: ShoeAtlas, design: Callable[[np.ndarray, np.ndarray], np.ndarray]) -> None:
    def fn(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        u = OUTSOLE_U_RANGE[0] + fu * (OUTSOLE_U_RANGE[1] - OUTSOLE_U_RANGE[0])
        w = OUTSOLE_W_RANGE[0] + fv * (OUTSOLE_W_RANGE[1] - OUTSOLE_W_RANGE[0])
        return design(u, w)

    atlas.bake(OUTSOLE_RECT, fn)


def bake_band(atlas: ShoeAtlas, index: int, design: Callable[[np.ndarray, np.ndarray], np.ndarray], band_length: float = 0.40) -> None:
    """띠 칸: (길이 방향 m, 폭 방향 0~1) → 휘도."""

    def fn(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        return design(fu * band_length, fv)

    atlas.bake(BAND_RECTS[index], fn)


def blend_projector(first: Projector, second: Projector, weight: Callable[[np.ndarray], np.ndarray]) -> Projector:
    """두 기준면을 점마다 가중(0 = first, 1 = second)으로 섞는다 — 갑피 위(라스트)에서 시작해 입구 위(몸)로 이어지는 혀·뒤꿈치 탭."""

    def project(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        qa, na = first(points)
        qb, nb = second(points)
        t = np.clip(weight(points), 0.0, 1.0)[:, None]
        return (1.0 - t) * qa + t * qb, unit((1.0 - t) * na + t * nb)

    return project


def shifted_projector(project: Projector, shift: float) -> Projector:
    """기준면을 법선 방향으로 `shift`만큼 옮긴다(음수면 안쪽). 라스트(몸 + 여유)를 몸 기준처럼 쓰려고 쓴다."""

    def shifted(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        q, n = project(points)
        return q + n * shift, n

    return shifted


def push_out(last: Last, points: np.ndarray, minimum: float) -> np.ndarray:
    """라스트 바깥 거리가 `minimum`보다 작은 점을 그 거리까지 밀어낸다(떠 있는 리본 고리가 갑피를 뚫지 않게)."""
    q, n = last.closest(points)
    d = np.einsum("ij,ij->i", points - q, n)
    return np.where((d < minimum)[:, None], q + n * minimum, points)


# 단색 칸 번호(아틀라스 PATCH): 스타일마다 같은 번호를 다른 휘도로 칠한다
P_LACE = 0
P_COLLAR = 1
P_KNOT = 2
P_TAB = 3
P_METAL = 4
P_DARK = 5
P_STRAP = 6

#: 스니커즈 끈 구간 끝(u/L)
LACE_END = 0.71


SNEAKER_STYLE = ShoeStyle(
    name="sneakers",
    kind="low",
    clearance=0.0045,
    shaft_clearance=0.0055,
    cut_v=0.125,
    columns=56,
    rows=13,
    sole_margin=0.0032,
    sole_top_side=0.0075,
    sole_top_toe=0.0150,
    sole_top_heel=0.0240,
    bevel=0.0025,
    top_round=0.0022,
    tuck=0.003,
    shank_recess=0.0,
    heel_breast=0.25,
    ball=0.62,
    collar_pad=(0.0042, 0.0024, 0.0048),
    sole_middle_points=3,
)

SNEAKER_PARAMS = ShoeParams(
    collar_back=0.070,
    collar_side=0.054,
    throat_u=0.40,
    sole_thickness=0.018,
    toe_extension=0.014,
    toe_box_height=0.054,
    toe_box_half_width=0.047,
    toe_plan_exponent=2.0,
    toe_spring=0.012,
)


def sneaker_lacing(last: Last, frame: FootFrame, top: np.ndarray, front_index: int, front_h: float, tongue_lift: float) -> tuple[list[tuple[str, Piece]], dict[str, Any]]:
    """아일릿 띠 2줄, 크리스크로스 끈, 맨 아래 가로 끈, 맨 위 리본 매듭(고리 2·꼬리 2·매듭)."""
    pieces: list[tuple[str, Piece]] = []
    length = frame.length
    u_open = float(frame.to_local(top[front_index])[0])
    rows = 5
    u_e = np.linspace(u_open + 0.012, LACE_END * length, rows)
    w_center = lambda u: np.interp(u, [u_open, LACE_END * length], [frame.leg[1], -0.004])  # noqa: E731
    half = lambda u: np.interp(u, [u_e[0], u_e[-1]], [0.0172, 0.0125])  # noqa: E731
    eyelet_arc: list[float] = []
    for sign in (1.0, -1.0):
        us = np.linspace(u_e[0] - 0.007, u_e[-1] + 0.009, 10)
        path, _ = last.top_point(us, w_center(us) + sign * half(us))
        band = surface_band("eyestay", last.closest, path, 0.0046, 0.0012, 0.0004, 2, BAND_RECTS[0])
        pieces.append((ROLE_ACCENT, band))
        if sign > 0:
            centers, _ = last.closest(path)
            seg = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(centers, axis=0), axis=1))])
            eye_points, _ = last.top_point(u_e, w_center(u_e) + sign * half(u_e))
            for p in eye_points:
                k = int(np.argmin(np.linalg.norm(centers - p, axis=1)))
                eyelet_arc.append(float(seg[k]))
    end_offset = 0.0012 + 0.0004 + 0.0006
    arch = max(tongue_lift + 0.0012 - end_offset, 0.002)
    lace_uv = patch_uv(P_LACE, 1)[0]
    for i in range(rows - 1):
        for sa, sb, lift in ((1.0, -1.0, 0.0007), (-1.0, 1.0, 0.0)):
            a = np.array([u_e[i], w_center(u_e[i]) + sa * half(u_e[i])])
            b = np.array([u_e[i + 1], w_center(u_e[i + 1]) + sb * half(u_e[i + 1])])
            path, normals = lace_path(last, a, b, end_offset + lift, arch, 6)
            pieces.append((ROLE_ACCENT, ribbon_sweep("lace", path, normals, 0.0034, 0.0010, False, lace_uv)))
    a = np.array([u_e[-1], w_center(u_e[-1]) + half(u_e[-1])])
    b = np.array([u_e[-1], w_center(u_e[-1]) - half(u_e[-1])])
    path, normals = lace_path(last, a, b, end_offset, arch * 0.8, 6)
    pieces.append((ROLE_ACCENT, ribbon_sweep("lace", path, normals, 0.0034, 0.0010, False, lace_uv)))
    # 리본 매듭: 맨 위 줄 가운데(혀 위)에 고리 둘과 꼬리 둘
    knot_uw = np.array([u_e[0] - 0.001, float(w_center(u_e[0]))])
    knot, knot_n = last.top_point([knot_uw[0]], [knot_uw[1]])
    knot = knot[0] + knot_n[0] * (tongue_lift + 0.0022)
    n0 = knot_n[0]
    across = unit(frame.dir_to_world(np.array([0.0, 1.0, 0.0])) - n0 * float(n0 @ frame.dir_to_world(np.array([0.0, 1.0, 0.0]))))
    back = unit(np.cross(across, n0))
    if float(back @ frame.dir_to_world(np.array([-1.0, 0.0, 0.0]))) < 0:
        back = -back
    for sign in (1.0, -1.0):
        theta = np.linspace(0.0, 2.0 * math.pi, 9)[:-1]
        reach = 0.0165 * (1.0 - np.cos(theta)) / 2.0
        loop = knot[None] + sign * across[None] * reach[:, None] + back[None] * (0.0048 * np.sin(theta) + 0.0035 * (1.0 - np.cos(theta)) / 2.0)[:, None] + n0[None] * (0.0025 * (1.0 - np.cos(theta)) / 2.0)[:, None]
        loop = push_out(last, loop, tongue_lift + 0.0012)
        _, loop_n = last.closest(loop)
        pieces.append((ROLE_ACCENT, ribbon_sweep("bow-loop", loop, loop_n, 0.0034, 0.0010, True, lace_uv)))
        t = np.linspace(0.0, 1.0, 6)
        tail_uw = np.stack([knot_uw[0] + 0.004 + 0.010 * t, knot_uw[1] + sign * (0.003 + 0.017 * t) + 0.0015 * np.sin(5.0 * t)], axis=1)
        tail, tail_n = last.top_point(tail_uw[:, 0], tail_uw[:, 1])
        tail = tail + tail_n * (tongue_lift + 0.0018 - (tongue_lift - 0.0028) * t)[:, None]
        tail = push_out(last, tail, 0.0028)
        _, tail_n = last.closest(tail)
        pieces.append((ROLE_ACCENT, ribbon_sweep("bow-tail", tail, tail_n, 0.0034, 0.0010, False, lace_uv)))
    knot_path = knot[None] + across[None] * np.array([-0.0026, 0.0, 0.0026])[:, None]
    knot_path = push_out(last, knot_path, tongue_lift + 0.0016)
    _, kn = last.closest(knot_path)
    pieces.append((ROLE_ACCENT, ribbon_sweep("knot", knot_path, kn, 0.0050, 0.0036, False, patch_uv(P_KNOT, 1)[0])))
    return pieces, {"eyeletArcM": eyelet_arc, "eyeletU": u_e.tolist(), "uOpen": u_open}


def sneaker_tongue_and_tab(last: Last, frame: FootFrame, ctx: "BodyContext", params: ShoeParams, style: ShoeStyle, top: np.ndarray, front_index: int, front_h: float) -> tuple[list[tuple[str, Piece]], float]:
    """혀(발등 갑피 위에서 시작해 입구 위로 1.6 cm 솟는 패드)와 뒤꿈치 탭. 반환: 조각, 혀 윗면의 라스트 기준 높이(끈 아치)."""
    pieces: list[tuple[str, Piece]] = []
    body = body_projector(ctx)
    on_last = shifted_projector(last.closest, -style.clearance)
    length = frame.length
    u_open = float(frame.to_local(top[front_index])[0])
    w_line = lambda u: np.interp(u, [u_open, LACE_END * length], [frame.leg[1], -0.004])  # noqa: E731
    us = np.linspace(LACE_END * length - 0.002, u_open, 5)
    lower, _ = last.top_point(us, w_line(us))
    upper_local = np.array([[u_open - 0.0032 * k, frame.leg[1], front_h + 0.0058 * k] for k in (1, 2, 3, 4)])
    path = np.vstack([lower, frame.to_world(upper_local)])

    def tongue_weight(points: np.ndarray) -> np.ndarray:
        v = frame.to_local(points)[:, 2]
        return smoothstep(front_h - 0.006, front_h + 0.004, v)

    project = blend_projector(on_last, body, tongue_weight)
    inner = np.concatenate([np.full(len(lower), style.clearance + 0.0008), np.array([0.0040, 0.0034, 0.0030, 0.0028])])
    thickness = 0.0030
    crown = 0.0016
    # 혀 폭: 끈 구간은 아일릿 띠 안쪽 가장자리(띠 중심 반간격 − 띠 반폭 4.6 mm)보다 1.2 mm 좁게(띠와 겹치지 않는다), 칼라 위로 오르며 넓어진다
    eyestay_inner = np.interp(us, [u_open + 0.012, LACE_END * length], [0.0172, 0.0125]) - 0.0046 - 0.0012
    half = np.concatenate([eyestay_inner, np.array([0.0135, 0.0160, 0.0178, 0.0185])])
    tongue = surface_band("tongue", project, path, half, thickness, inner, 4, BAND_RECTS[1], end_round=(0.0, 0.012), crown=crown)
    pieces.append((ROLE_UPPER, tongue))
    tongue_lift = 0.0008 + thickness + crown
    # 뒤꿈치 탭: 칼라 뒤 가운데에서 위로 1.2 cm
    tab_local = np.array([[0.0, frame.leg[1], v] for v in np.linspace(params.collar_back - 0.016, params.collar_back + 0.012, 6)])
    tab_path = frame.to_world(tab_local)
    tab_path, _ = last.closest(tab_path)

    def tab_weight(points: np.ndarray) -> np.ndarray:
        v = frame.to_local(points)[:, 2]
        return smoothstep(params.collar_back - 0.004, params.collar_back + 0.004, v)

    tab_project = blend_projector(on_last, body, tab_weight)
    tab_inner = np.linspace(style.clearance + 0.0007, 0.0036, len(tab_path))
    tab = surface_band("heel-tab", tab_project, tab_path, 0.0105, 0.0026, tab_inner, 4, BAND_RECTS[2], end_round=(0.0, 0.008))
    pieces.append((ROLE_ACCENT, tab))
    return pieces, tongue_lift


def sneaker_designs() -> dict[str, Any]:
    """스니커즈 텍스처(휘도): 흰 캔버스 갑피, 앞코 덧댐 + 펀칭, 뒤꿈치 보강, 스티치, 고무 밑창 줄, 헤링본 바닥."""

    def upper(g: dict[str, np.ndarray]) -> np.ndarray:
        u, w, v = g["u"], g["w"], g["v"]
        out = np.full(u.shape, 0.965)
        tip = TIP_U[0]
        w_rel = (w + 0.004) / 0.046
        u_cap = tip - 0.050 - 0.011 * w_rel**2
        cap = u > u_cap
        out = np.where(cap, 0.905, out)
        stitch_cap = (np.abs(u - (u_cap + 0.0021)) < 0.00042) & dashes(w * 1.0)
        perf_zone = cap & (u > u_cap + 0.009) & (v > 0.024)
        pu = (u - tip) / 0.0056
        row = np.floor(pu)
        pw = w / 0.0050 + 0.5 * (row % 2)
        dot = ((pu - row - 0.5) ** 2 * 0.0056**2 + (pw - np.round(pw)) ** 2 * 0.0050**2) < 0.00078**2
        out = np.where(perf_zone & dot, 0.74, out)
        mudguard = (g["from_bottom"] < 0.0150) & ~cap
        out = np.where(mudguard, 0.925, out)
        stitch_mud = (np.abs(g["from_bottom"] - 0.0128) < 0.00042) & ~cap & dashes(g["along"])
        counter_u = 0.074 - 0.55 * np.maximum(v - 0.012, 0.0)
        counter = (u < counter_u) & (v < 0.060)
        out = np.where(counter, 0.905, out)
        stitch_counter = (np.abs(u - (counter_u - 0.0021)) < 0.00042) & (v < 0.058) & dashes(v * 1.0)
        stitch_collar = (np.abs(g["to_top"] - 0.0060) < 0.00042) & dashes(g["along"])
        stitch_sole = (np.abs(g["from_bottom"] - 0.0068) < 0.00042) & dashes(g["along"])
        stitches = stitch_cap | stitch_counter | stitch_collar | stitch_sole | stitch_mud
        return np.where(stitches, 0.70, out)

    def sole(g: dict[str, np.ndarray]) -> np.ndarray:
        out = np.full(g["u"].shape, 1.0)
        stripe = (g["v"] > g["top_v"] - 0.0082) & (g["v"] < g["top_v"] - 0.0054)
        out = np.where(stripe, 0.50, out)
        tip = TIP_U[0]
        rib = (g["u"] > tip - 0.034) & (g["to_top"] > 0.0045) & (((g["along"] / 0.0030) % 1.0) < 0.5)
        out = np.where(rib, 0.94, out)
        return np.where(g["from_bottom"] < 0.0016, 0.86, out)

    def outsole(u: np.ndarray, w: np.ndarray) -> np.ndarray:
        out = np.full(u.shape, 0.66)
        wc = w + 0.006
        herring = ((u + np.abs(wc)) / 0.0048) % 1.0 < 0.34
        groove_zone = (u > 0.36 * FOOT_LEN[0]) | (u < 0.24 * FOOT_LEN[0])
        out = np.where(groove_zone & herring, 0.50, out)
        pivot_r = np.hypot(u - 0.72 * FOOT_LEN[0], wc + 0.006)
        rings = (pivot_r < 0.019) & ((pivot_r / 0.0042) % 1.0 < 0.45)
        out = np.where(pivot_r < 0.019, np.where(rings, 0.50, 0.70), out)
        heel_bars = (u < 0.24 * FOOT_LEN[0]) & ((u / 0.0050) % 1.0 < 0.38)
        out = np.where(heel_bars, 0.50, out)
        return out

    def eyestay(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        out = np.full(s.shape, 0.93)
        edge = ((np.abs(fv - 0.16) < 0.05) | (np.abs(fv - 0.84) < 0.05)) & dashes(s)
        out = np.where(edge, 0.72, out)
        for arc in EYELET_ARC:
            r = np.hypot(s - arc, (fv - 0.5) * 0.0092)
            out = np.where(r < 0.0021, 0.55, out)
            out = np.where(r < 0.0012, 0.30, out)
        return out

    def tongue(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        out = np.full(s.shape, 0.95)
        edge = ((np.abs(fv - 0.10) < 0.03) | (np.abs(fv - 0.90) < 0.03)) & dashes(s)
        out = np.where(edge, 0.74, out)
        label = (s > TONGUE_LEN[0] - 0.018) & (s < TONGUE_LEN[0] - 0.006) & (np.abs(fv - 0.5) < 0.22)
        return np.where(label, 0.82, out)

    def tab(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        out = np.full(s.shape, 0.84)
        edge = ((np.abs(fv - 0.15) < 0.05) | (np.abs(fv - 0.85) < 0.05)) & dashes(s)
        return np.where(edge, 1.0, out)

    return {"upper": upper, "sole": sole, "outsole": outsole, "bands": {0: eyestay, 1: tongue, 2: tab}, "patches": {P_LACE: 1.0, P_COLLAR: 0.94, P_KNOT: 0.97, P_TAB: 0.84}}


#: 텍스처 굽기 함수가 읽는 빌드 값(왼발 기준). 빌드마다 `set_design_context`가 채운다.
TIP_U = [0.25]
FOOT_LEN = [0.235]
EYELET_ARC: list[float] = []
TONGUE_LEN = [0.06]


def set_design_context(tip_u: float, foot_length: float, eyelet_arc: list[float] | None = None, tongue_length: float | None = None) -> None:
    TIP_U[0] = tip_u
    FOOT_LEN[0] = foot_length
    EYELET_ARC[:] = list(eyelet_arc or [])
    if tongue_length is not None:
        TONGUE_LEN[0] = tongue_length


def build_sneakers_side(frame: FootFrame, base: Any, ctx: "BodyContext", params: ShoeParams, layout: ShoeLayout | None = None) -> tuple[ShoeBuild, ShoeLayout]:
    style = SNEAKER_STYLE
    core = closed_core(frame, base, style, params, layout)
    last, columns, sole, grid, top, upper = core.last, core.columns, core.sole, core.grid, core.top, core.upper
    front_h, front_index = core.front_h, core.front_index
    pieces: list[tuple[str, Piece]] = [(ROLE_SOLE, sole.wall), (ROLE_SOLE, sole.bottom), (ROLE_UPPER, upper)]
    pieces.append((ROLE_UPPER, collar_pad_piece("collar", last, top, style.collar_pad, patch_uv(P_COLLAR, 1)[0])))
    tongue_pieces, tongue_lift = sneaker_tongue_and_tab(last, frame, ctx, params, style, top, front_index, front_h)
    pieces += tongue_pieces
    lacing, lacing_info = sneaker_lacing(last, frame, top, front_index, front_h, tongue_lift)
    pieces += lacing
    tongue_piece = next(p for role, p in tongue_pieces if p.name == "tongue")
    tongue_len = float(np.max(tongue_piece.uvs[:, 0]) * ATLAS_SIZE - BAND_RECTS[1].x - 0.5) / (BAND_RECTS[1].w - 1) * 0.40
    upper_local = frame.to_local(np.concatenate([grid, grid[:, :1]], axis=1))
    build = ShoeBuild(side=frame.side, pieces=pieces, upper_local=upper_local, sole_local=sole.wall_grid_local, ground_v=sole.ground_v, sole_row_v=sole.row_v,
                      info={"frontHeight": front_h, "tipU": frame.length + params.toe_extension, "footLength": frame.length, "tongueLength": tongue_len, **lacing_info})
    return build, ShoeLayout(columns=columns, upper_local=frame.to_local(grid) if grid is not None else None)


# ---------------------------------------------------------------- 한 켤레 조립·형상 키·GLB


@dataclass(frozen=True)
class ShoeDefinition:
    name: str
    build_side: Callable[..., tuple[ShoeBuild, ShoeLayout]]
    params: ShoeParams
    designs: Callable[[], dict[str, Any]]
    shape_variants: Callable[[ShoeParams], dict[str, ShoeParams]]
    changes_ko: str


def scaled(params: ShoeParams, **changes: float) -> ShoeParams:
    from dataclasses import replace as dc_replace

    return dc_replace(params, **changes)


def sneaker_shape_variants(p: ShoeParams) -> dict[str, ShoeParams]:
    return {
        "shape:height:+": scaled(p, collar_back=p.collar_back + 0.026, collar_side=p.collar_side + 0.030, throat_u=p.throat_u - 0.035),
        "shape:height:-": scaled(p, collar_back=p.collar_back - 0.010, collar_side=p.collar_side - 0.011, throat_u=p.throat_u + 0.03),
        "shape:sole:+": scaled(p, sole_thickness=p.sole_thickness * 1.7, toe_spring=p.toe_spring * 1.3),
        "shape:sole:-": scaled(p, sole_thickness=p.sole_thickness * 0.55, toe_spring=p.toe_spring * 0.7),
        "shape:toe:+": scaled(p, toe_extension=p.toe_extension + 0.010, toe_plan_exponent=1.75, toe_box_half_width=p.toe_box_half_width - 0.004, toe_box_height=p.toe_box_height - 0.006),
        "shape:toe:-": scaled(p, toe_extension=p.toe_extension - 0.004, toe_plan_exponent=2.9, toe_box_half_width=p.toe_box_half_width + 0.003, toe_box_height=p.toe_box_height + 0.006),
    }


SHOE_DEFINITIONS: dict[str, ShoeDefinition] = {}


def register_shoe(definition: ShoeDefinition) -> None:
    SHOE_DEFINITIONS[definition.name] = definition


register_shoe(
    ShoeDefinition(
        name="sneakers",
        build_side=build_sneakers_side,
        params=SNEAKER_PARAMS,
        designs=sneaker_designs,
        shape_variants=sneaker_shape_variants,
        changes_ko=(
            "베이스 발·발목 정점을 4.5 mm 부풀린 볼록 껍질에 둥근 앞코 돔을 더한 라스트 위에 갑피(고리띠 조화 이완)·컵솔(앞코 범퍼·뒤꿈치 감싸기·앞코 들림)·"
            "칼라 패딩·혀·아일릿 띠·크리스크로스 끈·리본 매듭·뒤꿈치 탭을 절차 생성하고, 앞코 덧댐·펀칭·뒤꿈치 보강·스티치·밑창 줄·헤링본 바닥을 상대색 텍스처로 구움. "
            "외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


@dataclass
class PairBuild:
    """양발 빌드: 같은 순서(왼발 → 오른발, 조각 순)로 합친 정점·삼각형과 역할 구간."""

    builds: dict[str, ShoeBuild]
    layouts: dict[str, ShoeLayout]
    positions: np.ndarray
    normals: np.ndarray
    uvs: np.ndarray
    triangles: np.ndarray
    vertex_role: np.ndarray  # 정점마다 역할 번호(SHOE_ROLES 순서)
    triangle_role: np.ndarray


def build_pair(definition: ShoeDefinition, base: Any, ctx: "BodyContext", params: ShoeParams, layouts: dict[str, ShoeLayout] | None = None) -> PairBuild:
    builds: dict[str, ShoeBuild] = {}
    out_layouts: dict[str, ShoeLayout] = {}
    for side in ("L", "R"):
        frame = measure_foot(base, side)
        build, layout = definition.build_side(frame, base, ctx, params, None if layouts is None else layouts[side])
        builds[side], out_layouts[side] = build, layout
    positions, normals, uvs, triangles, vertex_role, triangle_role = [], [], [], [], [], []
    offset = 0
    from character_kit.surface import vertex_normals

    for side in ("L", "R"):
        for role, piece in builds[side].pieces:
            index = SHOE_ROLES.index(role) if role in SHOE_ROLES else len(SHOE_ROLES)
            positions.append(piece.positions)
            normals.append(piece.normals if piece.normals is not None else vertex_normals(piece.positions, piece.triangles))
            uvs.append(piece.uvs)
            triangles.append(piece.triangles + offset)
            vertex_role.append(np.full(len(piece.positions), index))
            triangle_role.append(np.full(len(piece.triangles), index))
            offset += len(piece.positions)
    return PairBuild(
        builds=builds,
        layouts=out_layouts,
        positions=np.concatenate(positions),
        normals=unit(np.concatenate(normals)),
        uvs=np.concatenate(uvs),
        triangles=np.concatenate(triangles),
        vertex_role=np.concatenate(vertex_role),
        triangle_role=np.concatenate(triangle_role),
    )


def bake_shoe_atlas(definition: ShoeDefinition, pair: PairBuild) -> ShoeAtlas:
    left = pair.builds["L"]
    set_design_context(left.info["tipU"], left.info.get("footLength", FOOT_LEN[0]), left.info.get("eyeletArcM"), left.info.get("tongueLength"))
    if "strapLength" in left.info:
        STRAP_LEN[0] = left.info["strapLength"]
    if "apron" in left.info:
        APRON[:] = left.info["apron"]
    FRAME_LEG_W[0] = left.info.get("legW", -0.012)
    STRAP_ARCS.clear()
    STRAP_ARCS.update(left.info.get("strapArcs", {}))
    designs = definition.designs()
    atlas = ShoeAtlas(fill=0.92)
    if "footbed" in designs:
        bake_footbed(atlas, designs["footbed"])
    if left.upper_local is not None and "upper" in designs:
        bake_upper(atlas, left.upper_local, designs["upper"])
    if left.sole_local is not None and "sole" in designs:
        bake_sole_wall(atlas, left.sole_local, designs["sole"], left.sole_row_v)
    if "outsole" in designs:
        bake_outsole(atlas, designs["outsole"])
    for index, fn in designs.get("bands", {}).items():
        bake_band(atlas, index, fn)
    for index, value in designs.get("patches", {}).items():
        atlas.fill_patch(index, value)
    return atlas


def degenerate_count(positions: np.ndarray, triangles: np.ndarray, min_area: float = 1e-10) -> int:
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    return int((0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1) <= min_area).sum())


def shape_key_deltas(definition: ShoeDefinition, base: Any, ctx: "BodyContext", reference: PairBuild) -> dict[str, np.ndarray]:
    """형상 키 ± 빌드(같은 열 배치)와 기본 빌드의 정점 위치 차. 위상이 다르면 오류."""
    deltas: dict[str, np.ndarray] = {}
    for name, variant_params in definition.shape_variants(definition.params).items():
        variant = build_pair(definition, base, ctx, variant_params, reference.layouts)
        if variant.positions.shape != reference.positions.shape or not np.array_equal(variant.triangles, reference.triangles):
            raise ValueError(f"{definition.name} {name}: 형상 키 변형의 위상이 기본 빌드와 다르다")
        deltas[name] = variant.positions - reference.positions
    return deltas


def write_shoe_glb(
    path: Any,
    node: str,
    materials: list[tuple[str, np.ndarray]],
    pair: PairBuild,
    attach: dict[str, Any],
    base: Any,
    texture_jpeg: bytes,
    morph_names: list[str],
    extra_targets: dict[str, np.ndarray] | None = None,
) -> int:
    """메시 노드 하나에 프리미티브(재질)마다 삼각형 부분집합을 쓴다. `materials` = [(재질 이름, 정점 마스크)]. 모든 프리미티브가 같은 morph 이름·순서를 가진다."""
    from pathlib import Path

    from character_kit.base_assembly import QuantizedGlbWriter
    from character_kit.glbwriter import MorphTarget, Primitive
    from character_kit.retarget_garment import merge_skin_joints

    writer = QuantizedGlbWriter(generator="toonstudio character_kit forge")
    joint_names = base.joint_names
    parents = {name: (None if parent < 0 else joint_names[parent]) for name, parent in zip(joint_names, base.joint_parents, strict=True)}
    writer.add_skeleton(joint_names, parents, base.arrays["joint_tpose"].astype(np.float64))
    texture = writer.add_texture(texture_jpeg, "image/jpeg", name=f"{materials[0][0]}_basecolor")
    joints, weights = merge_skin_joints(np.asarray(attach["joints"]), np.asarray(attach["weights"]), joint_names, {})
    all_targets = {name: attach["deltas"][name] for name in morph_names}
    for name, delta in (extra_targets or {}).items():
        all_targets[name] = delta
    primitives = []
    for material_name, vertex_mask in materials:
        material_index = writer.add_material(material_name, base_color_texture=texture, base_color_factor=(1.0, 1.0, 1.0, 1.0), double_sided=True, metallic=0.0, roughness=0.8)
        keep_tri = vertex_mask[pair.triangles].all(axis=1)
        used = np.flatnonzero(vertex_mask)
        remap = -np.ones(len(pair.positions), dtype=np.int64)
        remap[used] = np.arange(len(used))
        primitives.append(
            Primitive(
                positions=pair.positions[used].astype(np.float32),
                indices=remap[pair.triangles[keep_tri]].astype(np.uint32),
                normals=pair.normals[used].astype(np.float32),
                uvs=pair.uvs[used].astype(np.float32),
                joints=joints[used].astype(np.uint8),
                weights=weights[used].astype(np.float32),
                material=material_index,
                targets=[MorphTarget(name=name, position=delta[used].astype(np.float32)) for name, delta in all_targets.items()],
            )
        )
    writer.add_mesh_node(node, primitives, skinned=True)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return writer.write(str(path))


# ---------------------------------------------------------------- 닫힌 신발 공통 뼈대와 일반화한 끈


@dataclass
class ClosedCore:
    last: Last
    columns: Columns
    sole: SoleResult
    top: np.ndarray  # 갑피 맨 윗행(칼라) 월드 점, 열 순서
    front_index: int
    front_h: float
    upper: Piece
    grid: np.ndarray


def closed_core(frame: FootFrame, base: Any, style: ShoeStyle, params: ShoeParams, layout: ShoeLayout | None) -> ClosedCore:
    last = make_shoe_last(frame, base, style, params)
    columns = layout.columns if layout is not None else make_columns(last, style.columns)
    sole = build_sole(last, columns, params, style)
    collar, front_h = shoe_collar(last, params)
    upper, grid, top = build_upper(last, columns, sole, collar, style.rows, None if layout is None else layout.upper_local)
    front_index = int(np.argmin(np.abs(columns.s - 0.5)))
    return ClosedCore(last=last, columns=columns, sole=sole, top=top, front_index=front_index, front_h=front_h, upper=upper, grid=grid)


def surface_walk(last: Last, start: np.ndarray, target: np.ndarray, step: float, stop: Callable[[np.ndarray], bool], max_steps: int = 200) -> np.ndarray:
    """라스트 표면 위를 목표점 쪽(접평면 투영 방향)으로 일정 보폭으로 걷는다(부츠 앞 중심선: 발등 → 정강이 앞)."""
    points = [last.closest(start[None])[0][0]]
    for _ in range(max_steps):
        p = points[-1]
        _, n = last.closest(p[None])
        g = target - p
        g = g - float(g @ n[0]) * n[0]
        if np.linalg.norm(g) < 1e-6:
            break
        q, _ = last.closest((p + unit(g) * step)[None])
        points.append(q[0])
        if stop(q[0]):
            break
    return np.array(points)


def offset_curve(last: Last, curve: np.ndarray, distance: Any) -> np.ndarray:
    """표면 곡선 옆으로(접평면에서 곡선에 수직, + = 곡선 진행 방향의 왼쪽) distance만큼 떨어진 곡선을 표면에 투영한다."""
    _, n = last.closest(curve)
    t = unit(np.gradient(curve, axis=0))
    side = unit(np.cross(n, t))
    d = np.broadcast_to(np.asarray(distance, dtype=np.float64), (len(curve),))
    return last.closest(curve + side * d[:, None])[0]


def surface_lace(last: Last, a: np.ndarray, b: np.ndarray, end_offset: float, arch: float, count: int) -> tuple[np.ndarray, np.ndarray]:
    """두 아일릿(월드) 사이 신발끈: 직선을 표면에 투영하고 offset(t) = end_offset + arch·sin(πt)만큼 띄운다. 반환: 위치, 법선."""
    t = np.linspace(0.0, 1.0, count)
    line = (1.0 - t)[:, None] * a[None] + t[:, None] * b[None]
    q, n = last.closest(line)
    offset = end_offset + arch * np.sin(math.pi * t)
    return q + n * offset[:, None], n


def lacing_on_curve(last: Last, center: np.ndarray, rows: int, half_start: float, half_end: float, tongue_lift: float, band_rect: Rect, lace_uv: np.ndarray, knot_uv: np.ndarray, lace_samples: int = 6, bow: bool = True, frame: FootFrame | None = None) -> tuple[list[tuple[str, Piece]], dict[str, Any]]:
    """표면 중심선(0 = 입구 쪽 위, 끝 = 발끝 쪽 아래) 위에 아일릿 띠 2줄, 크리스크로스 끈, 맨 아래 가로 끈, 맨 위 리본 매듭을 만든다."""
    pieces: list[tuple[str, Piece]] = []
    frac = polyline_fractions(center)
    f_rows = np.linspace(0.06, 0.94, rows)
    half_rows = np.interp(f_rows, [0.0, 1.0], [half_start, half_end])
    row_points = np.stack([np.interp(f_rows, frac, center[:, k]) for k in range(3)], axis=1)
    half_curve = np.interp(frac, [0.0, 1.0], [half_start, half_end])
    eyelet_arc: list[float] = []
    eyes: dict[float, np.ndarray] = {}
    for sign in (1.0, -1.0):
        rail = offset_curve(last, center, sign * half_curve)
        band = surface_band("eyestay", last.closest, rail, 0.0046, 0.0012, 0.0004, 2, band_rect)
        pieces.append((ROLE_ACCENT, band))
        rail_rows = offset_curve(last, row_points, sign * half_rows)
        eyes[sign] = rail_rows
        if sign > 0:
            seg = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(rail, axis=0), axis=1))])
            for p in rail_rows:
                k = int(np.argmin(np.linalg.norm(rail - p, axis=1)))
                eyelet_arc.append(float(seg[k]))
    end_offset = 0.0012 + 0.0004 + 0.0006
    arch = max(tongue_lift + 0.0012 - end_offset, 0.002)
    for i in range(rows - 1):
        for sa, sb, lift in ((1.0, -1.0, 0.0007), (-1.0, 1.0, 0.0)):
            path, normals = surface_lace(last, eyes[sa][i], eyes[sb][i + 1], end_offset + lift, arch, lace_samples)
            pieces.append((ROLE_ACCENT, ribbon_sweep("lace", path, normals, 0.0034, 0.0010, False, lace_uv)))
    path, normals = surface_lace(last, eyes[1.0][-1], eyes[-1.0][-1], end_offset, arch * 0.8, lace_samples)
    pieces.append((ROLE_ACCENT, ribbon_sweep("lace", path, normals, 0.0034, 0.0010, False, lace_uv)))
    if bow:
        knot = row_points[0]
        q, n = last.closest(knot[None])
        n0 = n[0]
        knot = q[0] + n0 * (tongue_lift + 0.0022)
        across = unit(eyes[1.0][0] - eyes[-1.0][0])
        across = unit(across - n0 * float(n0 @ across))
        down = unit(row_points[1] - row_points[0])
        back = -unit(down - n0 * float(n0 @ down))
        for sign in (1.0, -1.0):
            theta = np.linspace(0.0, 2.0 * math.pi, 7)[:-1]
            reach = 0.0165 * (1.0 - np.cos(theta)) / 2.0
            loop = knot[None] + sign * across[None] * reach[:, None] + back[None] * (0.0048 * np.sin(theta) + 0.0035 * (1.0 - np.cos(theta)) / 2.0)[:, None] + n0[None] * (0.0025 * (1.0 - np.cos(theta)) / 2.0)[:, None]
            loop = push_out(last, loop, tongue_lift + 0.0012)
            _, loop_n = last.closest(loop)
            pieces.append((ROLE_ACCENT, ribbon_sweep("bow-loop", loop, loop_n, 0.0034, 0.0010, True, lace_uv)))
            t = np.linspace(0.0, 1.0, 6)
            tail = knot[None] + sign * across[None] * (0.003 + 0.017 * t)[:, None] - back[None] * (0.004 + 0.010 * t)[:, None]
            q, qn = last.closest(tail)
            tail = q + qn * (tongue_lift + 0.0018 - (tongue_lift - 0.0028) * t)[:, None]
            tail = push_out(last, tail, 0.0028)
            _, tail_n = last.closest(tail)
            pieces.append((ROLE_ACCENT, ribbon_sweep("bow-tail", tail, tail_n, 0.0034, 0.0010, False, lace_uv)))
        knot_path = knot[None] + across[None] * np.array([-0.0026, 0.0, 0.0026])[:, None]
        knot_path = push_out(last, knot_path, tongue_lift + 0.0016)
        _, kn = last.closest(knot_path)
        pieces.append((ROLE_ACCENT, ribbon_sweep("knot", knot_path, kn, 0.0050, 0.0036, False, knot_uv)))
    return pieces, {"eyeletArcM": eyelet_arc}


def tube_piece(name: str, path: np.ndarray, normals: np.ndarray, profile: np.ndarray, closed: bool, rect: Rect | None, band_length: float = 0.40, uv: np.ndarray | None = None, y_hint: np.ndarray | None = None) -> Piece:
    """관 조각: UV는 띠 칸(길이 방향 호 길이, 둘레 비율) 또는 단색 칸 하나."""
    positions, triangles, params = sweep(path, normals, profile, closed=closed, cap_ends=not closed, y_hint=y_hint)
    triangles = orient_closed_components(positions, triangles)
    if rect is not None:
        length = float(np.linalg.norm(np.diff(path, axis=0), axis=1).sum())
        uvs = rect.uv(params[:, 0] * length / band_length, params[:, 1])
    else:
        uvs = np.tile(np.asarray(uv, dtype=np.float64).reshape(1, 2), (len(positions), 1))
    return Piece(name=name, positions=positions, triangles=triangles, uvs=uvs)


def cross_section_path(last: Last, frame: FootFrame, u: float, angle_deg: float, count: int, height: float = 0.022) -> np.ndarray:
    """발 단면(u 고정) 위 경로: 발 축 위 점에서 수직면 안의 각도 ±angle(0 = 위)로 쏜 광선의 라스트 출구점(안쪽 → 바깥쪽 순)."""
    alpha = np.radians(np.linspace(-angle_deg, angle_deg, count))
    guide = np.stack([np.full(count, u), 0.03 * np.sin(alpha), height + 0.03 * np.cos(alpha)], axis=1)
    return last.lift(frame.to_world(guide))


LOAFER_STYLE = ShoeStyle(
    name="loafers",
    kind="low",
    clearance=0.0036,
    shaft_clearance=0.0045,
    cut_v=0.115,
    columns=56,
    rows=12,
    sole_margin=0.0030,
    sole_top_side=0.0045,
    sole_top_toe=0.0060,
    sole_top_heel=0.0125,
    bevel=0.0012,
    top_round=0.0012,
    tuck=0.0025,
    shank_recess=0.0050,
    heel_breast=0.27,
    ball=0.60,
    collar_pad=(0.0022, 0.0016, 0.0026),
    sole_middle_points=3,
    dome_front_length=0.064,
    dome_back_length=0.08,
    dome_vertical_exponent=2.3,
)

LOAFER_PARAMS = ShoeParams(
    collar_back=0.056,
    collar_side=0.042,
    throat_u=0.575,
    sole_thickness=0.0115,
    toe_extension=0.024,
    toe_box_height=0.036,
    toe_box_half_width=0.0420,
    toe_plan_exponent=1.7,
    toe_spring=0.005,
)

P_MOC = 8


def build_loafers_side(frame: FootFrame, base: Any, ctx: "BodyContext", params: ShoeParams, layout: ShoeLayout | None = None) -> tuple[ShoeBuild, ShoeLayout]:
    style = LOAFER_STYLE
    core = closed_core(frame, base, style, params, layout)
    last = core.last
    length = frame.length
    pieces: list[tuple[str, Piece]] = [(ROLE_SOLE, core.sole.wall), (ROLE_SOLE, core.sole.bottom), (ROLE_UPPER, core.upper)]
    pieces.append((ROLE_UPPER, collar_pad_piece("collar", last, core.top, style.collar_pad, patch_uv(P_COLLAR, 1)[0], segments=5, samples=36)))
    u_open = float(frame.to_local(core.top[core.front_index])[0])
    tip = length + params.toe_extension
    # 모크 솔기: 발등 위 U자(페니 스트랩 앞에서 시작해 앞코 둘레를 돈다)
    w_c, a_w = -0.006, 0.0285
    u0 = u_open + 0.009
    u_front = tip - 0.024
    a_u = min(0.036, u_front - u0 - 0.004)
    legs = np.linspace(u0, u_front - a_u, 5)
    theta = np.linspace(-math.pi / 2, math.pi / 2, 15)
    cu, cw = np.cos(theta), np.sin(theta)
    arc_u = (u_front - a_u) + a_u * np.sign(cu) * np.abs(cu) ** (2.0 / 2.2)
    arc_w = w_c + a_w * np.sign(cw) * np.abs(cw) ** (2.0 / 2.2)
    us = np.concatenate([legs, arc_u[1:-1], legs[::-1]])
    ws = np.concatenate([np.full(5, w_c - a_w), arc_w[1:-1], np.full(5, w_c + a_w)])
    seam, seam_n = last.top_point(us, ws, 0.0)
    seam = seam + seam_n * 0.0004
    profile = ellipse_profile(0.0014, 0.0005, 0.0014, 5)
    pieces.append((ROLE_ACCENT, tube_piece("moc-seam", seam, seam_n, profile, False, BAND_RECTS[4])))
    # 페니 스트랩: 입구 바로 앞 발등을 가로지르는 띠(가운데 반달 홈은 텍스처)
    strap = cross_section_path(last, frame, u_open + 0.008, 74.0, 13)
    pieces.append((ROLE_ACCENT, surface_band("penny-strap", last.closest, strap, 0.0088, 0.0019, 0.0004, 3, BAND_RECTS[3], crown=0.0006, end_round=(0.006, 0.006))))
    strap_centers, _ = last.closest(strap)
    strap_len = float(np.linalg.norm(np.diff(strap_centers, axis=0), axis=1).sum())
    upper_local = frame.to_local(np.concatenate([core.grid, core.grid[:, :1]], axis=1))
    build = ShoeBuild(side=frame.side, pieces=pieces, upper_local=upper_local, sole_local=core.sole.wall_grid_local, ground_v=core.sole.ground_v, sole_row_v=core.sole.row_v,
                      info={"frontHeight": core.front_h, "tipU": tip, "footLength": length, "legW": float(frame.leg[1]), "strapLength": strap_len, "apron": [u0, u_front, w_c, a_w]})
    return build, ShoeLayout(columns=core.columns, upper_local=frame.to_local(core.grid))


STRAP_LEN = [0.09]
APRON = [0.13, 0.23, -0.006, 0.0285]


def loafer_designs() -> dict[str, Any]:
    """로퍼 텍스처: 가죽 갑피(약간 밝은 앞 덮개), 칼라·뒤 솔기 스티치, 웰트 스티치·적층 굽, 가죽 바닥(굽 리프트·못 자국)."""

    def upper(g: dict[str, np.ndarray]) -> np.ndarray:
        u, w, v = g["u"], g["w"], g["v"]
        out = np.full(u.shape, 0.84)
        u0, u_front, w_c, a_w = APRON
        apron = (u > u0) & (np.abs(w - w_c) < a_w - 0.0005) & (v > 0.018)
        out = np.where(apron, 0.88, out)
        stitch_collar = (np.abs(g["to_top"] - 0.0042) < 0.00045) & dashes(g["along"], 0.0030)
        stitch_sole = (np.abs(g["from_bottom"] - 0.0052) < 0.00045) & dashes(g["along"], 0.0030)
        back_seam = (np.abs(u) < 0.0045) & (np.abs(w + 0.012) < 0.0006) & dashes(v, 0.0030)
        out = np.where(stitch_collar | stitch_sole | back_seam, 1.0, out)
        counter_u = 0.060 - 0.45 * np.maximum(v - 0.010, 0.0)
        out = np.where((u < counter_u) & (v < 0.050) & ~(stitch_collar | stitch_sole | back_seam), 0.80, out)
        return out

    def sole(g: dict[str, np.ndarray]) -> np.ndarray:
        out = np.full(g["u"].shape, 0.68)
        heel = g["u"] < 0.27 * FOOT_LEN[0] + 0.002
        stack = heel & (((g["v"] - g["bottom_v"]) / 0.0030) % 1.0 < 0.18)
        out = np.where(heel, 0.54, out)
        out = np.where(stack, 0.44, out)
        welt = g["to_top"] < 0.0022
        out = np.where(welt, 0.70, out)
        out = np.where(welt & (np.abs(g["to_top"] - 0.0011) < 0.0005) & dashes(g["along"], 0.0028), 0.98, out)
        return out

    def outsole(u: np.ndarray, w: np.ndarray) -> np.ndarray:
        out = np.full(u.shape, 0.66)
        heel = u < 0.27 * FOOT_LEN[0]
        out = np.where(heel, 0.52, out)
        heel_center = np.hypot((u - 0.10 * FOOT_LEN[0]) / 0.040, (w + 0.008) / 0.030)
        out = np.where(heel & (np.abs(heel_center - 0.85) < 0.05), 0.40, out)
        nails = heel & (np.abs(heel_center - 0.72) < 0.06) & ((np.arctan2(w + 0.008, u - 0.10 * FOOT_LEN[0]) / 0.35) % 1.0 < 0.25)
        out = np.where(nails, 0.78, out)
        waist = (u > 0.30 * FOOT_LEN[0]) & (u < 0.58 * FOOT_LEN[0])
        out = np.where(waist, 0.66, out)
        return out

    def strap(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        out = np.full(s.shape, 0.80)
        edge = ((np.abs(fv - 0.14) < 0.04) | (np.abs(fv - 0.86) < 0.04)) & dashes(s, 0.0030)
        out = np.where(edge, 1.0, out)
        mid = STRAP_LEN[0] / 2.0
        lens = (np.abs(fv - 0.5) < 0.24) & (np.abs(s - mid) < 0.0105 * np.sqrt(np.clip(1.0 - ((fv - 0.5) / 0.24) ** 2, 0.0, 1.0)))
        return np.where(lens, 0.30, out)

    def moc(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        cross = ((s / 0.0034) % 1.0) < 0.42
        return np.where(cross, 1.0, 0.74)

    return {"upper": upper, "sole": sole, "outsole": outsole, "bands": {3: strap, 4: moc}, "patches": {P_COLLAR: 0.78}}


def loafer_shape_variants(p: ShoeParams) -> dict[str, ShoeParams]:
    return {
        "shape:height:+": scaled(p, collar_back=p.collar_back + 0.010, collar_side=p.collar_side + 0.012, throat_u=p.throat_u - 0.035),
        "shape:height:-": scaled(p, collar_back=p.collar_back - 0.008, collar_side=p.collar_side - 0.008, throat_u=p.throat_u + 0.03),
        "shape:sole:+": scaled(p, sole_thickness=p.sole_thickness * 1.8, toe_spring=p.toe_spring * 1.4),
        "shape:sole:-": scaled(p, sole_thickness=p.sole_thickness * 0.65, toe_spring=p.toe_spring * 0.8),
        "shape:toe:+": scaled(p, toe_extension=p.toe_extension + 0.010, toe_plan_exponent=1.55, toe_box_half_width=p.toe_box_half_width - 0.004, toe_box_height=p.toe_box_height - 0.004),
        "shape:toe:-": scaled(p, toe_extension=p.toe_extension - 0.006, toe_plan_exponent=2.5, toe_box_half_width=p.toe_box_half_width + 0.003, toe_box_height=p.toe_box_height + 0.005),
    }


BOOT_STYLE = ShoeStyle(
    name="boots",
    kind="boot",
    clearance=0.0050,
    shaft_clearance=0.0060,
    cut_v=0.178,
    columns=50,
    rows=13,
    sole_margin=0.0042,
    sole_top_side=0.0100,
    sole_top_toe=0.0160,
    sole_top_heel=0.0240,
    bevel=0.0020,
    top_round=0.0018,
    tuck=0.003,
    shank_recess=0.0040,
    heel_breast=0.27,
    ball=0.62,
    collar_pad=(0.0050, 0.0030, 0.0056),
    sole_middle_points=3,
    bevel_rows=2,
    dome_front_length=0.062,
    dome_back_length=0.08,
    dome_vertical_exponent=2.5,
)

BOOT_PARAMS = ShoeParams(
    collar_back=0.150,
    collar_side=0.146,
    throat_u=0.40,
    sole_thickness=0.020,
    toe_extension=0.016,
    toe_box_height=0.052,
    toe_box_half_width=0.048,
    toe_plan_exponent=2.1,
    toe_spring=0.009,
    collar_front=0.142,
)


def build_boots_side(frame: FootFrame, base: Any, ctx: "BodyContext", params: ShoeParams, layout: ShoeLayout | None = None) -> tuple[ShoeBuild, ShoeLayout]:
    style = BOOT_STYLE
    core = closed_core(frame, base, style, params, layout)
    last = core.last
    length = frame.length
    pieces: list[tuple[str, Piece]] = [(ROLE_SOLE, core.sole.wall), (ROLE_SOLE, core.sole.bottom), (ROLE_UPPER, core.upper)]
    pieces.append((ROLE_UPPER, collar_pad_piece("collar", last, core.top, style.collar_pad, patch_uv(P_COLLAR, 1)[0], segments=6, samples=28)))
    # 앞 중심선: 발등(0.66 L)에서 정강이 앞을 따라 목둘레 아래 1.2 cm까지
    start_local = np.array([0.66 * length, -0.004, 0.06])
    start = last.top_point([start_local[0]], [start_local[1]])[0][0]
    shaft_front = frame.to_local(core.top[core.front_index])
    target = frame.to_world(np.array([frame.leg[0] + 0.02, frame.leg[1], shaft_front[2] + 0.03]))
    stop_v = shaft_front[2] - 0.010
    walk = surface_walk(last, start, target, 0.004, lambda q: frame.to_local(q)[2] >= stop_v)
    center = resample_polyline(walk[::-1], 16)  # 위(입구) → 아래(발등)
    # 혀: 중심선을 따라 목둘레 위 1.2 cm까지(위쪽은 몸 기준)
    body = body_projector(ctx)
    on_last = shifted_projector(last.closest, -style.shaft_clearance)
    top_front = core.top[core.front_index]
    up_dir = unit(center[0] - center[2])
    tongue_top = [top_front + up_dir * 0.006 * k for k in (1, 2)]
    tongue_path = np.vstack([np.array(tongue_top[::-1]), center[:-1]])[::-1]
    shaft_v = shaft_front[2]

    def tongue_weight(points: np.ndarray) -> np.ndarray:
        return smoothstep(shaft_v - 0.006, shaft_v + 0.004, frame.to_local(points)[:, 2])

    project = blend_projector(on_last, body, tongue_weight)
    inner = np.concatenate([np.full(len(tongue_path) - 2, style.shaft_clearance + 0.0008), np.array([0.0045, 0.0038])])
    thickness, crown = 0.0028, 0.0012
    # 혀 폭: 끈 구간은 아일릿 띠 안쪽 가장자리보다 좁게(아래 → 위 0.0135 → 0.0165 중심 반간격 기준), 목둘레 위 두 점은 넓게
    along = polyline_fractions(tongue_path[:-2])
    half = np.concatenate([np.interp(along, [0.0, 1.0], [0.0135, 0.0165]) - 0.0046 - 0.0012, np.array([0.0150, 0.0170])])
    pieces.append((ROLE_UPPER, surface_band("tongue", project, tongue_path, half, thickness, inner, 4, BAND_RECTS[1], end_round=(0.0, 0.011), crown=crown)))
    lacing, lacing_info = lacing_on_curve(last, center, 6, 0.0165, 0.0135, 0.0008 + thickness + crown, BAND_RECTS[0], patch_uv(P_LACE, 1)[0], patch_uv(P_KNOT, 1)[0], lace_samples=4)
    pieces += lacing
    # 당김 탭: 목둘레 뒤 가운데에서 위로 1.3 cm
    back = core.top[0]
    tab_local = np.array([[0.0, frame.leg[1], v] for v in np.linspace(params.collar_back - 0.018, params.collar_back + 0.017, 6)])
    tab_path = last.closest(frame.to_world(tab_local))[0]

    def tab_weight(points: np.ndarray) -> np.ndarray:
        return smoothstep(params.collar_back - 0.004, params.collar_back + 0.004, frame.to_local(points)[:, 2])

    tab_project = blend_projector(on_last, body, tab_weight)
    tab_inner = np.linspace(style.shaft_clearance + 0.0008, 0.0042, len(tab_path))
    pieces.append((ROLE_ACCENT, surface_band("pull-tab", tab_project, tab_path, 0.0105, 0.0018, tab_inner, 3, BAND_RECTS[2], end_round=(0.0, 0.0075))))
    del back
    upper_local = frame.to_local(np.concatenate([core.grid, core.grid[:, :1]], axis=1))
    build = ShoeBuild(side=frame.side, pieces=pieces, upper_local=upper_local, sole_local=core.sole.wall_grid_local, ground_v=core.sole.ground_v, sole_row_v=core.sole.row_v,
                      info={"frontHeight": core.front_h, "tipU": length + params.toe_extension, "footLength": length, "legW": float(frame.leg[1]), "tongueLength": 0.40, **lacing_info})
    return build, ShoeLayout(columns=core.columns, upper_local=frame.to_local(core.grid))


def boot_designs() -> dict[str, Any]:
    """부츠 텍스처: 가죽 갑피(앞코 덧댐 이중 스티치·뒤꿈치 보강·뒤 솔기·윗단 스티치), 웰트 스티치·러그 홈 고무 밑창, 러그 바닥, 은색 아일릿."""

    def upper(g: dict[str, np.ndarray]) -> np.ndarray:
        u, w, v = g["u"], g["w"], g["v"]
        out = np.full(u.shape, 0.85)
        tip = TIP_U[0]
        w_rel = (w + 0.004) / 0.046
        u_cap = tip - 0.056 - 0.012 * w_rel**2
        cap = u > u_cap
        out = np.where(cap, 0.80, out)
        s1 = (np.abs(u - (u_cap + 0.0022)) < 0.00045) & dashes(w, 0.0030)
        s2 = (np.abs(u - (u_cap + 0.0042)) < 0.00045) & dashes(w, 0.0030)
        counter_u = 0.078 - 0.40 * np.maximum(v - 0.015, 0.0)
        counter = (u < counter_u) & (v < 0.075)
        out = np.where(counter, 0.80, out)
        s3 = (np.abs(u - (counter_u - 0.0022)) < 0.00045) & (v < 0.073) & dashes(v, 0.0030)
        back_seam = (np.abs(u) < 0.006) & (np.abs(w - FRAME_LEG_W[0]) < 0.0006) & (v > 0.06) & dashes(v, 0.0030)
        s4 = (np.abs(g["to_top"] - 0.0068) < 0.00045) & dashes(g["along"], 0.0030)
        s5 = (np.abs(g["from_bottom"] - 0.0060) < 0.00045) & dashes(g["along"], 0.0030)
        return np.where(s1 | s2 | s3 | back_seam | s4 | s5, 1.0, out)

    def sole(g: dict[str, np.ndarray]) -> np.ndarray:
        out = np.full(g["u"].shape, 0.60)
        welt = g["to_top"] < 0.0042
        out = np.where(welt, 0.76, out)
        out = np.where(welt & (np.abs(g["to_top"] - 0.0021) < 0.0005) & dashes(g["along"], 0.0032), 1.0, out)
        lug = (g["v"] - g["bottom_v"] < 0.0070) & (((g["along"] / 0.0062) % 1.0) < 0.22)
        return np.where(lug, 0.42, out)

    def outsole(u: np.ndarray, w: np.ndarray) -> np.ndarray:
        wc = w + 0.006
        chevron = ((u - 0.9 * np.abs(wc)) / 0.0085) % 1.0
        lug = chevron < 0.62
        out = np.where(lug, 0.64, 0.42)
        heel = u < 0.27 * FOOT_LEN[0]
        heel_lug = (((u / 0.0090) % 1.0) < 0.6) & ((np.abs(wc) / 0.012 % 1.0) < 0.8)
        out = np.where(heel, np.where(heel_lug, 0.64, 0.42), out)
        waist = (u > 0.30 * FOOT_LEN[0]) & (u < 0.58 * FOOT_LEN[0])
        return np.where(waist, 0.54, out)

    def eyestay(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        out = np.full(s.shape, 0.80)
        edge = ((np.abs(fv - 0.16) < 0.05) | (np.abs(fv - 0.84) < 0.05)) & dashes(s, 0.0030)
        out = np.where(edge, 1.0, out)
        for arc in EYELET_ARC:
            r = np.hypot(s - arc, (fv - 0.5) * 0.0092)
            out = np.where(r < 0.0021, 1.0, out)
            out = np.where(r < 0.0012, 0.22, out)
        return out

    def tongue(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        out = np.full(s.shape, 0.88)
        edge = ((np.abs(fv - 0.10) < 0.03) | (np.abs(fv - 0.90) < 0.03)) & dashes(s, 0.0030)
        return np.where(edge, 1.0, out)

    def tab(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        out = np.full(s.shape, 0.70)
        edge = ((np.abs(fv - 0.18) < 0.06) | (np.abs(fv - 0.82) < 0.06)) & dashes(s, 0.0030)
        return np.where(edge, 1.0, out)

    return {"upper": upper, "sole": sole, "outsole": outsole, "bands": {0: eyestay, 1: tongue, 2: tab}, "patches": {P_LACE: 0.74, P_COLLAR: 0.88, P_KNOT: 0.74}}


FRAME_LEG_W = [-0.012]


def boot_shape_variants(p: ShoeParams) -> dict[str, ShoeParams]:
    return {
        "shape:height:+": scaled(p, collar_back=p.collar_back + 0.030, collar_side=p.collar_side + 0.030, collar_front=(p.collar_front or 0.0) + 0.030),
        "shape:height:-": scaled(p, collar_back=p.collar_back - 0.030, collar_side=p.collar_side - 0.030, collar_front=(p.collar_front or 0.0) - 0.030),
        "shape:sole:+": scaled(p, sole_thickness=p.sole_thickness * 1.6, toe_spring=p.toe_spring * 1.3),
        "shape:sole:-": scaled(p, sole_thickness=p.sole_thickness * 0.6, toe_spring=p.toe_spring * 0.7),
        "shape:toe:+": scaled(p, toe_extension=p.toe_extension + 0.010, toe_plan_exponent=1.7, toe_box_half_width=p.toe_box_half_width - 0.004, toe_box_height=p.toe_box_height - 0.006),
        "shape:toe:-": scaled(p, toe_extension=p.toe_extension - 0.004, toe_plan_exponent=2.9, toe_box_half_width=p.toe_box_half_width + 0.003, toe_box_height=p.toe_box_height + 0.006),
    }

STRAP_ARCS: dict[str, float] = {}


def bake_footbed(atlas: ShoeAtlas, design: Callable[[np.ndarray, np.ndarray], np.ndarray]) -> None:
    def fn(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        u = OUTSOLE_U_RANGE[0] + fu * (OUTSOLE_U_RANGE[1] - OUTSOLE_U_RANGE[0])
        w = OUTSOLE_W_RANGE[0] + fv * (OUTSOLE_W_RANGE[1] - OUTSOLE_W_RANGE[0])
        return design(u, w)

    atlas.bake(FOOTBED_RECT, fn)


# ---------------------------------------------------------------- 샌들


SANDAL_STYLE = ShoeStyle(
    name="sandals",
    kind="low",
    clearance=0.0016,
    shaft_clearance=0.0018,
    cut_v=0.115,
    columns=56,
    rows=2,
    sole_margin=0.0052,
    sole_top_side=0.0,
    sole_top_toe=0.0,
    sole_top_heel=0.0,
    bevel=0.0018,
    top_round=0.0016,
    tuck=0.0,
    shank_recess=0.0,
    heel_breast=0.27,
    ball=0.62,
    collar_pad=None,
)

SANDAL_PARAMS = ShoeParams(
    collar_back=0.076,  # 발목 스트랩 뒤 높이
    collar_side=0.082,
    throat_u=0.0,
    sole_thickness=0.014,
    toe_extension=0.007,
    toe_box_height=0.0,
    toe_box_half_width=0.0,
    toe_plan_exponent=2.2,  # 깔창 앞 평면 모양
    toe_spring=0.004,
    collar_front=0.090,
)

P_BUCKLE = 9


def sandal_last(frame: FootFrame, base: Any, params: ShoeParams) -> Last:
    """샌들 라스트: 여유 1.6 mm의 볼록 껍질(스트랩이 발에 붙되 발가락 사이·아킬레스 오목을 건너간다). 깔창 앞 모양은 발끝 연장과 평면 지수로."""
    regions = (f"foot.{frame.side}", f"calf.{frame.side}")
    points, normals = body_region_vertices(base, regions)
    length = frame.length
    tip = length + params.toe_extension
    # 깔창 앞 윤곽용 납작한 초타원(발가락 밑에서 앞으로 연장): 껍질의 바닥 둘레만 키우고 위는 건드리지 않는다
    theta = np.linspace(-math.pi / 2, math.pi / 2, 31)
    a_u, a_w = 0.050, 0.046
    cu, cw = np.cos(theta), np.sin(theta)
    pe = params.toe_plan_exponent
    u = tip - a_u + a_u * np.sign(cu) * np.abs(cu) ** (2.0 / pe)
    w = -0.005 + a_w * np.sign(cw) * np.abs(cw) ** (2.0 / pe)
    extra = np.concatenate([np.stack([u, w, np.full(len(u), 0.002)], axis=1), np.stack([u, w, np.full(len(u), 0.010)], axis=1)])
    return build_last(frame, points, normals, clearance=lambda v: np.full(len(v), SANDAL_STYLE.clearance), cut_v=SANDAL_STYLE.cut_v, extra_local=extra)


def build_footbed(last: Last, columns: Columns, params: ShoeParams, style: ShoeStyle, plantar: FootbedSurface) -> tuple[list[tuple[str, Piece]], np.ndarray, float, np.ndarray]:
    """샌들 밑창: 열마다 평면 실루엣 + 여유의 수직 벽(바닥 모따기·윗 모서리 둥글림·테두리 턱 1.5 mm), 윗면 깔창은 발바닥 아래 포락면을 따른다."""
    frame = last.frame
    n = len(columns)
    heights = np.arange(0.0, 0.03, 0.0015)
    reach = column_reach(last, columns, heights)
    m = style.sole_margin
    profiles = []
    rim = []
    for i in range(n):
        valid = ~np.isnan(reach[i])
        r_wall = float(np.nanmax(reach[i][valid])) + m
        o, d = columns.origin[i], columns.direction[i]
        edge_u, edge_w = o[0] + (r_wall - 0.004) * d[0], o[1] + (r_wall - 0.004) * d[1]
        bed = float(plantar.height(np.array([edge_u]), np.array([edge_w]))[0])
        vt = bed + 0.0015
        vb = float(sole_bottom_v(np.array([o[0] + (r_wall - style.bevel) * d[0]]), frame, params, style)[0])
        b, tr = style.bevel, style.top_round
        prof = [(r_wall - b, vb), (r_wall - b * (1 - math.sin(math.pi / 4)), vb + b * (1 - math.cos(math.pi / 4))), (r_wall, vb + b), (r_wall, 0.5 * (vb + vt)), (r_wall, vt - tr)]
        prof += [(r_wall - tr + tr * math.cos(a), vt - tr + tr * math.sin(a)) for a in (math.radians(45), math.radians(90))]
        prof += [(r_wall - tr - 0.0012, vt), (r_wall - tr - 0.0022, bed)]
        profiles.append(np.array(prof))
        rim.append((r_wall - tr - 0.0022, bed))
    k = len(profiles[0])
    local = np.zeros((k, n, 3))
    for i, prof in enumerate(profiles):
        o, d = columns.origin[i], columns.direction[i]
        local[:, i, 0] = o[0] + prof[:, 0] * d[0]
        local[:, i, 1] = o[1] + prof[:, 0] * d[1]
        local[:, i, 2] = prof[:, 1]
    world = frame.to_world(local)

    def outward(points: np.ndarray) -> np.ndarray:
        return unit(points - last.spine_origin(points))

    seg = np.linalg.norm(np.diff(local, axis=0), axis=2)
    frac = np.concatenate([np.zeros((1, n)), np.cumsum(seg, axis=0)], axis=0) / np.maximum(seg.sum(axis=0), 1e-9)
    row_v = np.maximum.accumulate(np.clip(np.median(frac, axis=1), 0.0, 1.0))
    row_v[-1] = 1.0
    wall = grid_piece("sole-wall", world, SOLE_RECT, outward, row_v=row_v)
    pieces: list[tuple[str, Piece]] = [(ROLE_SOLE, wall)]
    for name, ring_uv, heights_fn, rect, down in (
        ("sole-bottom", local[0, :, :2], lambda uu, ww: sole_bottom_v(uu, frame, params, style), OUTSOLE_RECT, True),
        ("footbed", local[-1, :, :2], lambda uu, ww: plantar.height(uu, ww), FOOTBED_RECT, False),
    ):
        center = ring_uv.mean(axis=0)
        if not is_star_shaped(ring_uv, center):
            raise ValueError(f"샌들 {name} 고리가 별 모양이 아니다")
        cap_uv, cap_tris, _ = ring_fan_cap(ring_uv, center, rings=9 if name == "footbed" else 2)
        cap_v = heights_fn(cap_uv[:, 0], cap_uv[:, 1])
        ring_heights = local[0, :, 2] if down else local[-1, :, 2]
        cap_v[: len(ring_uv)] = ring_heights
        cap_local = np.stack([cap_uv[:, 0], cap_uv[:, 1], cap_v], axis=1)
        cap_world = frame.to_world(cap_local)
        direction = -UP if down else UP
        cap_tris = orient_to(cap_world, cap_tris, lambda c, direction=direction: np.tile(direction, (len(c), 1)))
        fu = (cap_local[:, 0] - OUTSOLE_U_RANGE[0]) / (OUTSOLE_U_RANGE[1] - OUTSOLE_U_RANGE[0])
        fv = (cap_local[:, 1] - OUTSOLE_W_RANGE[0]) / (OUTSOLE_W_RANGE[1] - OUTSOLE_W_RANGE[0])
        normals = None if not down else np.tile(-UP, (len(cap_world), 1))
        pieces.append((ROLE_SOLE, Piece(name=name, positions=cap_world, triangles=cap_tris, uvs=rect.uv(fu, fv), normals=normals)))
    wall_local = np.concatenate([local, local[:, :1]], axis=1)
    ground = float(local[0, :, 2].min())
    return pieces, wall_local, ground, row_v


def build_sandals_side(frame: FootFrame, base: Any, ctx: "BodyContext", params: ShoeParams, layout: ShoeLayout | None = None) -> tuple[ShoeBuild, ShoeLayout]:
    style = SANDAL_STYLE
    last = sandal_last(frame, base, params)
    columns = layout.columns if layout is not None else make_columns(last, style.columns, ref_v=0.012)
    plantar, contact = footbed_surface(frame, base)
    pieces, wall_local, ground, row_v = build_footbed(last, columns, params, style, plantar)
    length = frame.length
    leg_u, leg_w = float(frame.leg[0]), float(frame.leg[1])
    arcs: dict[str, float] = {}

    def strap(name: str, path: np.ndarray, half: float, rect: Rect, role: str = ROLE_UPPER, closed: bool = False, end_round: tuple[float, float] = (0.0, 0.0)) -> Piece:
        piece = surface_band(name, last.closest, path, half, 0.0022, 0.0004, 3, rect, end_round=end_round, closed=closed, crown=0.0004)
        centers, _ = last.closest(path)
        arcs[name] = float(np.linalg.norm(np.diff(np.vstack([centers, centers[:1]]) if closed else centers, axis=0), axis=1).sum())
        pieces.append((role, piece))
        return piece

    # 1) 앞발 스트랩: 발가락 뿌리 위를 가로지르고 양 끝은 깔창 테두리 안으로 들어간다
    u_f = 0.735 * length
    fore = cross_section_path(last, frame, u_f, 104.0, 15, height=0.020)
    strap("fore-strap", fore, 0.0105, BAND_RECTS[0])
    # 2) T 스트랩: 앞발 스트랩 가운데에서 발등을 따라 발목 스트랩 앞까지
    ankle_front_v = params.collar_front if params.collar_front is not None else params.collar_side
    us = np.linspace(u_f - 0.004, leg_u + 0.048, 8)
    ws = np.interp(us, [leg_u + 0.048, u_f], [leg_w + 0.002, -0.004])
    t_path = last.top_point(us, ws)[0]
    front_point = collar_loop(last, frame.leg, collar_heights(params.collar_back, params.collar_side, ankle_front_v), 720)[360]
    t_path = np.vstack([t_path, front_point])
    t_path = resample_polyline(t_path, 10)
    strap("t-strap", t_path, 0.0058, BAND_RECTS[1])
    # 3) 발목 스트랩(닫힌 고리)
    ankle = collar_loop(last, frame.leg, collar_heights(params.collar_back, params.collar_side, ankle_front_v), 720)
    ankle = resample_polyline(ankle, 28, closed=True)
    strap("ankle-strap", ankle, 0.0052, BAND_RECTS[2], closed=True)
    # 4) 뒤꿈치 스트랩: 깔창 뒤에서 발목 스트랩까지
    heel_local = np.array([[0.0, leg_w, v] for v in np.linspace(0.010, params.collar_back + 0.004, 7)])
    heel_path = last.closest(frame.to_world(heel_local))[0]
    strap("heel-strap", heel_path, 0.0085, BAND_RECTS[3], end_round=(0.0, 0.004))
    # 5) 버클(바깥쪽): 발목 스트랩 위 사각 틀 + 혀(핀) + 스트랩 끝
    lateral_index = int(np.argmax(frame.to_local(ankle)[:, 1]))
    center_point = ankle[lateral_index]
    _, n = last.closest(center_point[None])
    n = n[0]
    tangent = unit(ankle[(lateral_index + 1) % len(ankle)] - ankle[lateral_index - 1])
    side = unit(np.cross(n, tangent))
    lift = 0.0004 + 0.0022 + 0.0011
    corners = [center_point + n * lift + tangent * a + side * b for a, b in ((-0.0045, -0.0068), (0.0045, -0.0068), (0.0045, 0.0068), (-0.0045, 0.0068))]
    frame_path = resample_polyline(np.array(corners), 12, closed=True)
    profile = ellipse_profile(0.0009, 0.0009, 0.0009, 5)
    pieces.append((ROLE_ACCENT, tube_piece("buckle", frame_path, np.tile(n, (len(frame_path), 1)), profile, True, None, uv=patch_uv(P_BUCKLE, 1)[0])))
    prong = np.array([center_point + n * lift - tangent * 0.0045, center_point + n * (lift + 0.0003), center_point + n * lift + tangent * 0.0047])
    pieces.append((ROLE_ACCENT, tube_piece("prong", prong, np.tile(n, (3, 1)), ellipse_profile(0.0006, 0.0006, 0.0006, 4), False, None, uv=patch_uv(P_BUCKLE, 1)[0])))
    tail_idx = [(lateral_index + k) % len(ankle) for k in range(0, 4)]
    tail = ankle[tail_idx]
    _, tn = last.closest(tail)
    tail = tail + tn * 0.0024
    pieces.append((ROLE_ACCENT, surface_band("strap-tail", last.closest, tail, 0.0047, 0.0018, 0.0026, 2, BAND_RECTS[2], end_round=(0.0, 0.004))))
    build = ShoeBuild(side=frame.side, pieces=pieces, upper_local=None, sole_local=wall_local, ground_v=ground, sole_row_v=row_v,
                      info={"tipU": length + params.toe_extension, "footLength": length, "legW": leg_w, "strapArcs": arcs, **contact})
    return build, ShoeLayout(columns=columns)


def sandal_designs() -> dict[str, Any]:
    """샌들 텍스처: 스트랩 가장자리 스티치, 코르크 웨지 옆벽(아래 고무 띠), 밝은 깔창(발가락 둔덕 선·가장자리 박음질), 물결 바닥."""
    rng = np.random.default_rng(7)
    speck = rng.random((64, 64))

    def strap_band(s: np.ndarray, fv: np.ndarray) -> np.ndarray:
        out = np.full(s.shape, 0.90)
        edge = ((np.abs(fv - 0.14) < 0.04) | (np.abs(fv - 0.86) < 0.04)) & dashes(s, 0.0030)
        return np.where(edge, 1.0, out)

    def sole(g: dict[str, np.ndarray]) -> np.ndarray:
        iu = (np.abs(g["along"] * 900).astype(int)) % 64
        iv = (np.abs(g["v"] * 2400).astype(int)) % 64
        cork = 0.86 + 0.08 * (speck[iu, iv] - 0.5)
        out = np.where(g["v"] - g["bottom_v"] < 0.0042, 0.55, cork)
        return np.where(g["to_top"] < 0.0030, 0.97, out)

    def footbed(u: np.ndarray, w: np.ndarray) -> np.ndarray:
        out = np.full(u.shape, 0.97)
        toe_bar = np.abs(u - 0.80 * FOOT_LEN[0] + 0.004 * ((w + 0.005) / 0.04) ** 2) < 0.0012
        return np.where(toe_bar, 0.88, out)

    def outsole(u: np.ndarray, w: np.ndarray) -> np.ndarray:
        wave = ((u + 0.004 * np.sin(w / 0.006)) / 0.0055) % 1.0 < 0.35
        return np.where(wave, 0.45, 0.60)

    return {
        "sole": sole,
        "footbed": footbed,
        "outsole": outsole,
        "bands": {0: strap_band, 1: strap_band, 2: strap_band, 3: strap_band},
        "patches": {P_BUCKLE: 1.0},
    }


def sandal_shape_variants(p: ShoeParams) -> dict[str, ShoeParams]:
    return {
        "shape:height:+": scaled(p, collar_back=p.collar_back + 0.014, collar_side=p.collar_side + 0.014, collar_front=(p.collar_front or 0.0) + 0.014),
        "shape:height:-": scaled(p, collar_back=p.collar_back - 0.010, collar_side=p.collar_side - 0.010, collar_front=(p.collar_front or 0.0) - 0.010),
        "shape:sole:+": scaled(p, sole_thickness=p.sole_thickness * 2.0, toe_spring=p.toe_spring * 1.5),
        "shape:sole:-": scaled(p, sole_thickness=p.sole_thickness * 0.55, toe_spring=p.toe_spring * 0.7),
        "shape:toe:+": scaled(p, toe_extension=p.toe_extension + 0.008, toe_plan_exponent=1.6),
        "shape:toe:-": scaled(p, toe_extension=p.toe_extension - 0.002, toe_plan_exponent=3.2),
    }


register_shoe(
    ShoeDefinition(
        name="loafers",
        build_side=build_loafers_side,
        params=LOAFER_PARAMS,
        designs=loafer_designs,
        shape_variants=loafer_shape_variants,
        changes_ko=(
            "베이스 발·발목 정점을 3.6 mm 부풀린 볼록 껍질에 아몬드형 앞코 돔을 더한 라스트 위에 갑피·얇은 웰트 밑창(허리 홈으로 굽이 갈라 보인다)·"
            "말린 칼라 테두리·모크 솔기(U자 돋을 솔기)·페니 스트랩을 절차 생성하고, 앞 덮개·스티치·적층 굽·웰트 박음질·가죽 바닥(굽 리프트·못 자국)을 상대색 텍스처로 구움. "
            "외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)
register_shoe(
    ShoeDefinition(
        name="boots",
        build_side=build_boots_side,
        params=BOOT_PARAMS,
        designs=boot_designs,
        shape_variants=boot_shape_variants,
        changes_ko=(
            "베이스 발·종아리 정점을 5~7.5 mm 부풀린 볼록 껍질에 둥근 앞코 돔을 더한 라스트 위에 목 높이 15 cm 갑피·러그 밑창(허리 홈·웰트)·칼라 패딩·"
            "발등에서 정강이로 오르는 6단 아일릿 띠와 크리스크로스 끈·리본 매듭·혀·당김 탭을 절차 생성하고, 앞코 덧댐 이중 스티치·뒤꿈치 보강·뒤 솔기·러그 무늬를 "
            "상대색 텍스처로 구움. 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)
register_shoe(
    ShoeDefinition(
        name="sandals",
        build_side=build_sandals_side,
        params=SANDAL_PARAMS,
        designs=sandal_designs,
        shape_variants=sandal_shape_variants,
        changes_ko=(
            "베이스 발바닥 높이장(뒤꿈치가 볼보다 약 8 mm 높다)을 따르는 깔창과 코르크 웨지 밑창, 여유 1.6 mm 볼록 껍질 위의 앞발 스트랩·T 스트랩·"
            "발목 스트랩(닫힌 고리)·뒤꿈치 스트랩·바깥쪽 버클(틀·핀·스트랩 끝)을 절차 생성하고, 스트랩 스티치·코르크 입자·깔창 둔덕선·물결 바닥을 상대색 텍스처로 구움. "
            "외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)



