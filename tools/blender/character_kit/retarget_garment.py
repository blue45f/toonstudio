"""의상 리타깃: 정리·축소된 Hyper3D 메시 → 키트 파츠 GLB (bpy venv 전용: mathutils BVH가 필요하다).

사용:
    <venv>/bin/python -I retarget_garment.py --preset top/tee --base-model <base_model_female.npz> \\
        --garment <decimated.glb> [--garment <LOD1.glb> --garment <LOD2.glb>] --kit-dir <키트 폴더> \\
        [--parts-json <hides 레지스트리.json>] [--report <보고서.json>] [--debug-apose <A-포즈 확인용.glb>]

흐름(`garment_fit` 모듈 설명 참조): A-포즈 몸에 의상을 맞추고(정렬 → 충돌 해소 → 몸 표면 결합) → 결합을 T-포즈 몸과 morph를 입힌 몸에 다시 평가해
파츠의 레스트 위치와 morph 델타를 얻는다. 스킨은 결합한 삼각형의 웨이트를 섞는다. 텍스처는 상대색 JPEG로 다시 굽는다.
쓰기 전에 검증기 V9와 같은 척도(`base_assembly.follow_deviation`)로 morph를 따라가는지 먼저 잰다.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from character_kit import garment_fit as gf  # noqa: E402
from character_kit.base_assembly import BaseModel, QuantizedGlbWriter, ensure_min_delta, follow_deviation, load_base_model  # noqa: E402
from character_kit.garment_presets import PRESETS, morph_names  # noqa: E402
from character_kit.garment_texture import TextureStyle, relative_color_texture, strand_texture  # noqa: E402
from character_kit.glbwriter import GlbWriter, MorphTarget, Primitive  # noqa: E402
from character_kit.rig import build_rig  # noqa: E402
from character_kit.skin import convert_to_t_pose, vertex_adjacency  # noqa: E402
from character_kit.gltf_read import StaticMesh, read_static_mesh  # noqa: E402
from character_kit.surface import Surface, vertex_normals  # noqa: E402

#: 이 값(m)보다 작은 morph 델타는 0으로 접어 sparse accessor로 쓴다(`base_assembly.FADE_LO/FADE_HI`와 같은 규칙).
FADE_LO = 2e-5
FADE_HI = 6e-5
#: 검증기 V9는 `param:*` morph의 최대 델타 ≥ 1e-5 m를 요구한다. 해당 morph가 의상 위치에 닿지 않으면 이 바닥(m)을 +Y로 더한다.
#: 몸 영역 정점의 이 비율 이상이 의상에 덮여야 그 영역을 숨긴다(`hides`).
HIDE_COVERAGE = 0.985
FRAME_SHIFT_LIMIT_M = 0.05  # frame 정렬에서 기준점이 초기 목표에서 벗어날 수 있는 최대 거리
TEAR_RATIO = 2.5  # A→T 변환에서 변이 이만큼 늘어나고 TEAR_MIN_LENGTH_M 넘게 길어진 삼각형은 떼어 낸다(겨드랑이의 정상적인 늘어남은 2배 안팎)
TEAR_MIN_LENGTH_M = 0.055
HIDE_DISTANCE_M = 0.03


# ---------------------------------------------------------------- 몸 표면(몸 + 머리 한 덩어리)


@dataclass
class BodySurface:
    apose: np.ndarray  # (N,3) A-포즈 위치
    tpose: np.ndarray  # (N,3) T-포즈 위치
    triangles: np.ndarray  # (T,3)
    region: np.ndarray  # (N,) 영역 번호
    joints: np.ndarray  # (N,4)
    weights: np.ndarray  # (N,4)
    morphs: dict[str, np.ndarray]  # 이름 → (N,3) 위치 델타
    region_ids: list[str]
    body_vertex_count: int

    def region_index(self, name: str) -> int:
        return self.region_ids.index(name)


def build_body_surface(base: BaseModel, names: list[str]) -> BodySurface:
    body = base.mesh("body_")
    head = base.mesh("head_")
    count_body = len(body["apose_positions"])
    count_head = len(head["apose_positions"])

    def concat(key: str) -> np.ndarray:
        return np.concatenate([body[key], head[key]])

    morphs: dict[str, np.ndarray] = {}
    for name in names:
        parts = []
        for mesh, count in ((body, count_body), (head, count_head)):
            known = [str(v) for v in mesh["morph_names"]]
            parts.append(mesh["morph_delta"][known.index(name)].astype(np.float64) if name in known else np.zeros((count, 3)))
        morphs[name] = np.concatenate(parts)
    return BodySurface(
        apose=concat("apose_positions").astype(np.float64),
        tpose=concat("tpose_positions").astype(np.float64),
        triangles=np.concatenate([body["triangles"], head["triangles"] + count_body]).astype(np.int64),
        region=concat("region").astype(np.int64),
        joints=concat("joints").astype(np.int64),
        weights=concat("weights").astype(np.float64),
        morphs=morphs,
        region_ids=base.region_ids,
        body_vertex_count=count_body,
    )


def landmarks(bs: BodySurface) -> dict[str, float]:
    """A-포즈 몸에서 정렬 기준 높이를 잰다(영역 정점의 y 범위)."""

    def span(region: str) -> tuple[float, float]:
        y = bs.apose[bs.region == bs.region_index(region), 1]
        return float(y.min()), float(y.max())

    neck_low, neck_high = span("neck")
    _, pelvis_high = span("pelvis")
    _, head_top = span("head")
    return {
        # 칼라 윗선: 목 영역 아래쪽 40 % 지점(HBM 여성 실측 y ≈ 1.44에 해당)
        "collar": neck_low + 0.40 * (neck_high - neck_low),
        # 허리 윗선: 골반 영역 위 + 1.7 cm(저위 허리)
        "waist": pelvis_high + 0.017,
        "head_top": head_top,
    }


# ---------------------------------------------------------------- 덩어리와 정렬


def vertex_components(vertex_count: int, triangles: np.ndarray) -> np.ndarray:
    parent = list(range(vertex_count))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, c in triangles.tolist():
        for other in (b, c):
            ra, ro = find(a), find(other)
            if ra != ro:
                parent[ro] = ra
    return np.array([find(i) for i in range(vertex_count)])


def region_vertices(bs: BodySurface, names: list[str]) -> np.ndarray:
    mask = np.isin(bs.region, [bs.region_index(n) for n in names])
    return bs.apose[mask]


def align_pieces(spec: dict, pieces: list[np.ndarray], bs: BodySurface, surface: Surface) -> list[dict]:
    """덩어리마다 (scale, translation)을 정한다. align 방식은 프리셋 표 설명을 본다."""
    align = spec["align"]
    marks = landmarks(bs)
    out: list[dict] = []
    if align == "icp":
        for pts in pieces:
            anchor_source = np.array([0.5 * (pts[:, 0].min() + pts[:, 0].max()), pts[:, 1].max(), 0.5 * (pts[:, 2].min() + pts[:, 2].max())])
            torso = region_vertices(bs, ["torso"])
            target = np.array([0.0, marks[spec["icp"]["landmark"]], float(torso[:, 2].mean())])
            # 후보 구간 밖으로 배율이 달아나거나 한쪽 다리로 쏠리는 지역 최솟값을 막는다(남성 베이스에서 슬랙스가 한쪽 다리에 걸렸다).
            scales = spec["icp"]["scales"]
            scale, translation, cost = gf.fit_similarity(
                pts,
                surface,
                scales,
                anchor_source,
                target,
                scale_limit=(min(scales) * spec["icp"].get("scale_slack", 0.88), max(scales) * 1.08),
                shift_limit=spec["icp"].get("shift", 0.06),
            )
            # 의상은 좌우 대칭이므로 몸 중심(x=0)에 앞/뒤·높이만 맞추고 좌우로는 옮기지 않는다(좌우 쏠림은 한쪽 다리만 덮는 지역 최솟값이었다).
            translation = np.array(translation, dtype=np.float64)
            translation[0] = target[0] - float(scale) * anchor_source[0]
            out.append({"scale": float(scale), "translation": translation, "cost": cost})
    elif align == "frame":
        # 전신 한 벌에서 BANG으로 분리한 파츠: 파츠들이 같은 좌표계를 공유하므로 전신 경계 상자를 베이스 키·발바닥·중심에 대응시켜 초기 정렬한 뒤,
        # `fit_region`이 가리키는 부위(상의=어깨·가슴 띠, 하의=허리 띠, 헤어=정수리 띠)만 몸 표면과의 부호 있는 거리로 ICP 보정한다.
        # 전신 그림의 머리·목 비율이 베이스와 달라 키 비율만으로는 칼라·허리 높이가 몇 cm씩 어긋나고, 제한이 없으면 몸에 붙으려고 의상이 줄어든다.
        frame = spec["_frame"]
        region = spec.get("fit_region", {})
        low, high = np.array(frame["min"], dtype=np.float64), np.array(frame["max"], dtype=np.float64)
        body_low, body_high = bs.tpose.min(axis=0), bs.tpose.max(axis=0)
        s0 = float((body_high[1] - body_low[1]) / (high[1] - low[1]))
        source_anchor = np.array([0.5 * (low[0] + high[0]), low[1], 0.5 * (low[2] + high[2])])
        feet = region_vertices(bs, ["foot.L", "foot.R"])
        target_anchor = np.array([0.0, body_low[1], 0.5 * (feet[:, 2].min() + feet[:, 2].max())])
        scale_lo, scale_hi = region.get("scale", (0.97, 1.03))
        for pts in pieces:
            fit_points = pts
            if "top_band" in region or "x_max" in region:
                mask = np.ones(len(pts), dtype=bool)
                if "top_band" in region:
                    mask &= pts[:, 1] >= pts[:, 1].max() - region["top_band"] / s0
                if "x_max" in region:
                    mask &= np.abs(pts[:, 0] - 0.5 * (pts[:, 0].min() + pts[:, 0].max())) <= region["x_max"] / s0
                if int(mask.sum()) >= 200:
                    fit_points = pts[mask]
            scale, translation, cost = gf.fit_similarity(
                fit_points,
                surface,
                [scale_lo * s0, s0, scale_hi * s0],
                source_anchor,
                target_anchor,
                cap=0.12,
                scale_limit=(scale_lo * s0, scale_hi * s0),
                shift_limit=region.get("shift", FRAME_SHIFT_LIMIT_M),
                target_distance=region.get("standoff"),
            )
            translation = np.array(translation, dtype=np.float64)
            translation[0] = target_anchor[0] - float(scale) * source_anchor[0]  # 좌우 대칭: 몸 중심에 맞춘다
            out.append({"scale": float(scale), "translation": translation, "cost": cost, "frame_scale": s0, "fit_points": int(len(fit_points))})
    elif align == "head_ref":
        # 같은 좌표계의 머리(살색) 메시 치수로 헤어를 베이스 머리에 맞춘다: 두개골 폭이 베이스 머리 폭이 되는 배율, 정수리·좌우·앞뒤 중심 일치.
        # 포니테일·트윈테일처럼 가닥이 옆으로 퍼진 헤어는 헤어 자체의 폭으로는 머리 크기를 알 수 없다.
        ref = spec["_ref"]
        head = region_vertices(bs, ["head"])
        head_width = float(head[:, 0].max() - head[:, 0].min())
        scale = head_width / float(ref["width"])
        # 머리 메시가 헤어라인에서 잘린 원본(히메컷처럼 두피까지 헤어 파츠에 들어간 경우)은 정수리를 `ref_top_extra`(두개골 폭의 배수)만큼 올려 잡는다.
        top = float(ref["top"]) + float(spec.get("ref_top_extra", 0.0)) * float(ref["width"])
        source = np.array([float(ref["centerX"]), top, 0.5 * (float(ref["minZ"]) + float(ref["maxZ"]))])
        goal = np.array([0.0, float(head[:, 1].max()), 0.5 * (float(head[:, 2].min()) + float(head[:, 2].max()))])
        for _ in pieces:
            out.append({"scale": float(scale), "translation": goal - scale * source, "cost": None, "ref_scale": float(scale)})
    elif align == "anchor":
        # 허리에 걸치는 치마류: 의상 맨 위 띠(허리선)를 몸의 기준 높이에 걸고 길이를 `anchor.length_m`에 맞춘다(균일 배율). 전신 비율이 베이스와 달라
        # `frame`으로는 허리·밑단 높이가 어긋나고(롱스커트가 허벅지까지 내려왔다), 영역 ICP는 허리띠를 더 가는 곳으로 끌어내린다.
        anchor = spec["anchor"]
        pelvis = region_vertices(bs, ["pelvis"])
        goal_y = marks[anchor["landmark"]] + float(anchor.get("offset", 0.0))
        for pts in pieces:
            height = float(pts[:, 1].max() - pts[:, 1].min())
            scale = float(anchor["length_m"]) / height
            band = pts[pts[:, 1] >= pts[:, 1].max() - 0.08 * height]
            source = np.array([0.5 * (band[:, 0].min() + band[:, 0].max()), float(pts[:, 1].max()), 0.5 * (band[:, 2].min() + band[:, 2].max())])
            goal = np.array([0.0, goal_y, float(pelvis[:, 2].mean()) + float(anchor.get("z_offset", 0.0))])
            out.append({"scale": scale, "translation": goal - scale * source, "cost": None})
    elif align == "head_prop":
        # 머리에 얹는 소품(모자·헤드폰): 머리 너비 + 여유에 소품 너비를 맞추고, 정수리(+ 오프셋)에 소품 꼭대기를, 머리 상자 앞뒤 중심(+ 오프셋)에 맞춘다.
        head = region_vertices(bs, ["head"])
        head_width = head[:, 0].max() - head[:, 0].min()
        prop = spec["head_prop"]
        for pts in pieces:
            scale = (head_width + prop["width_margin"]) / (pts[:, 0].max() - pts[:, 0].min())
            center = np.array([0.5 * (pts[:, 0].min() + pts[:, 0].max()), pts[:, 1].max(), 0.5 * (pts[:, 2].min() + pts[:, 2].max())])
            goal = np.array([0.0, head[:, 1].max() + prop["top_offset"], 0.5 * (head[:, 2].min() + head[:, 2].max()) + prop["z_offset"]])
            out.append({"scale": float(scale), "translation": goal - scale * center, "cost": None})
    elif align == "hair":
        head = region_vertices(bs, ["head"])
        head_width = head[:, 0].max() - head[:, 0].min()
        for pts in pieces:
            scale = (head_width + 0.06) / (pts[:, 0].max() - pts[:, 0].min())
            center = np.array([0.5 * (pts[:, 0].min() + pts[:, 0].max()), pts[:, 1].max(), 0.5 * (pts[:, 2].min() + pts[:, 2].max())])
            goal = np.array([0.0, head[:, 1].max() + 0.025, 0.5 * (head[:, 2].min() + head[:, 2].max()) - 0.005])
            out.append({"scale": float(scale), "translation": goal - scale * center, "cost": None})
    elif align == "shoes":
        feet = {1.0: region_vertices(bs, ["foot.L"]), -1.0: region_vertices(bs, ["foot.R"])}
        lengths = [f[:, 2].max() - f[:, 2].min() for f in feet.values()]
        shoe_lengths = [pts[:, 2].max() - pts[:, 2].min() for pts in pieces]
        scale = 1.12 * float(np.mean(lengths)) / float(np.mean(shoe_lengths))
        for pts in pieces:
            side = 1.0 if pts[:, 0].mean() > 0 else -1.0  # 모델 +x = 캐릭터 왼쪽
            foot = feet[side]
            source = np.array([0.5 * (pts[:, 0].min() + pts[:, 0].max()), pts[:, 1].min(), 0.5 * (pts[:, 2].min() + pts[:, 2].max())])
            goal = np.array([0.5 * (foot[:, 0].min() + foot[:, 0].max()), foot[:, 1].min() - 0.012, 0.5 * (foot[:, 2].min() + foot[:, 2].max())])
            out.append({"scale": scale, "translation": goal - scale * source, "cost": None, "side": side})
    else:
        raise ValueError(f"알 수 없는 align: {align}")
    return out


# ---------------------------------------------------------------- 본체


def fade_small(delta: np.ndarray) -> np.ndarray:
    magnitude = np.linalg.norm(delta, axis=1, keepdims=True)
    t = np.clip((magnitude - FADE_LO) / (FADE_HI - FADE_LO), 0.0, 1.0)
    t = t * t * (3.0 - 2.0 * t)
    return delta * t


def retarget_one(mesh: StaticMesh, spec: dict, bs: BodySurface, surface: Surface, surface_t: Surface, rig, parents: list[int], names: list[str], transforms: list[dict] | None = None) -> dict:
    """정리·축소된 메시 하나를 파츠 한 개(LOD)로 만든다. 결과 배열 묶음을 돌려준다.

    `spec["pose"]`: 의상이 만들어진 포즈. `"t"`(기본)면 몸의 T-포즈 표면에 바로 맞추고(소매가 수평인 상의, 다리·머리·발만 있는 하의·헤어·신발),
    `"a"`면 A-포즈 몸에 맞춘 뒤 베이스와 같은 변환(DQS + 어깨 전이 영역 ARAP)으로 T-포즈로 옮긴다(팔을 내린 전신에서 분리한 의상).
    포즈가 안 맞는 몸에 맞추면 소매가 날개처럼 펼쳐진다.
    """
    pose = spec.get("pose", "t")
    waist_y = landmarks(bs)["waist"]

    def d_min_for(points: np.ndarray) -> float | np.ndarray:
        """상의의 밑단은 하의 허리띠 바깥에 놓이도록 허리선 아래로 갈수록 몸에서 더 띄운다(`hem_standoff`). 둘 다 몸에서 8~30 mm라 겹치면 하의가 상의를 뚫는다."""
        hem = spec.get("hem_standoff")
        if not hem or spec["role"] != "top":
            return spec["d_min"]
        t = np.clip((waist_y + hem["above"] - points[:, 1]) / hem["blend"], 0.0, 1.0)
        t = t * t * (3.0 - 2.0 * t)
        return spec["d_min"] + t * (hem["d_min"] - spec["d_min"])

    fit_surface = surface_t if pose == "t" else surface
    body_fit_positions = bs.tpose if pose == "t" else bs.apose

    canon_index, canon_positions = gf.weld_vertices(mesh.positions)
    canon_triangles = canon_index[mesh.triangles]
    edges = gf.undirected_edges(canon_triangles)
    open_edge = gf.boundary_vertex_mask(len(canon_positions), canon_triangles)

    if spec["align"] == "shoes":
        labels = vertex_components(len(canon_positions), canon_triangles)
        values, counts = np.unique(labels, return_counts=True)
        piece_vertices = [np.flatnonzero(labels == values[i]) for i in np.argsort(-counts)[:2]]
    else:
        piece_vertices = [np.arange(len(canon_positions))]

    piece_points = [canon_positions[v] for v in piece_vertices]
    transforms = transforms or align_pieces(spec, piece_points, bs, fit_surface)
    conformed = canon_positions.copy()
    piece_reports = []
    stylize = int(spec.get("stylize", 0))
    for vertices, transform in zip(piece_vertices, transforms, strict=True):
        fitted = transform["scale"] * canon_positions[vertices] + transform["translation"]
        index_map = -np.ones(len(canon_positions), dtype=np.int64)
        index_map[vertices] = np.arange(len(vertices))
        keep = np.isin(edges[:, 0], vertices) & np.isin(edges[:, 1], vertices)
        sub_edges = index_map[edges[keep]]
        d_before, _, _ = gf.signed_distance(fitted, fit_surface)
        out = gf.conform(fitted, sub_edges, open_edge[vertices], fit_surface, d_min_for(fitted), spec["d_max"], d_max_open=spec.get("d_max_open", float("inf")))
        if stylize:
            # 스무딩 → 충돌 한 번 더(스무딩이 몸 안으로 밀 수 있다)
            piece_tris = index_map[canon_triangles[np.all(np.isin(canon_triangles, vertices), axis=1)]]
            out = gf.stylize_smooth(out, piece_tris, open_edge[vertices], stylize)
            out = gf.conform(out, sub_edges, open_edge[vertices], fit_surface, d_min_for(out), 1.0e9, passes=1, smooth_iterations=2)
        d_after, _, _ = gf.signed_distance(out, fit_surface)
        conformed[vertices] = out
        piece_reports.append(
            {
                "vertices": int(len(vertices)),
                "scale": round(transform["scale"], 5),
                "translation": [round(float(v), 5) for v in transform["translation"]],
                "penetratingBefore": round(float((d_before < 0).mean() * 100), 2),
                "penetratingAfter": round(float((d_after < 0).mean() * 100), 2),
                "meanDistanceAfter": round(float(np.abs(d_after).mean()), 4),
            }
        )

    bang_report = None
    if spec["role"] == "hair" and spec.get("bang_target_y") is not None:
        # 앞머리가 눈을 가리면 눈썹 위로 올리고, 줄어든 만큼 머리에 가까워졌을 수 있어 충돌을 다시 푼다.
        head_front = float(region_vertices(bs, ["head"])[:, 2].mean())
        lifted, bang_report = gf.raise_bangs(conformed, float(spec["bang_target_y"]), face_z=head_front, center_half_width=float(spec.get("bang_half_width", 0.07)))
        if bang_report["raised"]:
            conformed = gf.conform(lifted, edges, open_edge, fit_surface, d_min_for(lifted), spec["d_max"], d_max_open=spec.get("d_max_open", float("inf")))
    canon_normals = gf.orient_outward(conformed, vertex_normals(conformed, canon_triangles), fit_surface)
    sleeve_report = None
    sleeve_membership = None
    if pose == "a" and spec["role"] == "top" and spec.get("align_sleeves", True):
        # 헐렁한 소매는 몸의 팔과 각도가 달라 팔을 올릴 때 날개처럼 늘어진다 → 소매를 어깨 둘레로 팔 방향에 맞추고 다시 충돌을 푼다.
        chains = [{"arm": rig.index(f"mixamorig:{side}Arm"), "forearm": rig.index(f"mixamorig:{side}ForeArm"), "hand": rig.index(f"mixamorig:{side}Hand")} for side in ("Left", "Right")]
        torso = bs.apose[np.isin(bs.region, [bs.region_index(name) for name in ("torso", "pelvis")])]
        profile_edges = np.linspace(float(torso[:, 1].min()), float(torso[:, 1].max()), 30)
        profile_bins = np.clip(np.searchsorted(profile_edges, torso[:, 1]) - 1, 0, len(profile_edges) - 2)
        half_width = np.zeros(len(profile_edges) - 1)
        np.maximum.at(half_width, profile_bins, np.abs(torso[:, 0]))
        aligned, sleeve_membership, sleeve_report = gf.align_sleeves_to_arms(conformed, canon_normals, rig.a_pose, chains, torso_profile=(profile_edges, half_width))
        if not np.array_equal(aligned, conformed):
            conformed = gf.conform(aligned, edges, open_edge, fit_surface, d_min_for(aligned), spec["d_max"], d_max_open=spec.get("d_max_open", float("inf")))
            canon_normals = gf.orient_outward(conformed, vertex_normals(conformed, canon_triangles), fit_surface)
    body_normals_fit = vertex_normals(body_fit_positions, bs.triangles)
    # 스킨: 법선이 호환되는 가까운 몸 정점들의 웨이트(소매 안쪽이 몸통 옆면이 아니라 팔 안쪽 면의 웨이트를 받는다).
    joints, weights, compat_ratio = gf.compatible_vertex_skin(conformed, canon_normals, body_fit_positions, body_normals_fit, bs.joints, bs.weights)
    if sleeve_membership is not None and float(sleeve_membership.max()) > 0.5:
        arm_names = [f"mixamorig:{side}{part}" for side in ("Left", "Right") for part in ("Shoulder", "Arm", "ForeArm", "Hand")]
        arm_joint_ids = [rig.index(name) for name in arm_names] + [i for i, name in enumerate(rig.names) if name.startswith(("mixamorig:LeftHand", "mixamorig:RightHand")) and name.rsplit(":", 1)[1] not in ("LeftHand", "RightHand")]
        side_for_arm = "Left" if float(np.mean(conformed[sleeve_membership > 0.5][:, 0])) > 0 else "Right"
        joints, weights, weight_report = gf.constrain_arm_weights(
            conformed,
            joints,
            weights,
            sleeve_membership,
            edges,
            arm_joint_ids,
            [rig.a_pose[rig.index(f"mixamorig:{side}Arm")] for side in ("Left", "Right")],
            fallback_torso=rig.index("mixamorig:Spine1"),
            fallback_arm=(rig.index(f"mixamorig:{side_for_arm}Arm"), rig.index(f"mixamorig:{side_for_arm}ForeArm"), float(rig.a_pose[rig.index(f"mixamorig:{side_for_arm}ForeArm")][1])),
        )
        sleeve_report["weights"] = weight_report
    torn_faces = 0
    debug_torn = None
    mesh_positions_full = mesh.positions
    if pose == "t":
        rest_canon = conformed
    else:
        # A→T: 베이스와 같은 변환을 적용한다. 몸 표면에 삼각형 프레임으로 직접 결합하면 겨드랑이에서 소매 아랫면과 몸통 옆판 사이 삼각형이
        # 납작하게 늘어난 "날개"가 생기고, 본 선분 거리 웨이트는 몸통 옆구리가 팔 영향을 받아 풍선처럼 부푼다.
        # 소매가 밑단에 닿아 이어진 생성물은 팔을 올리면 그 이음 삼각형이 긴 띠가 되므로, 변환한 결과에서 크게 늘어난 삼각형을 뗀다.
        # 어깨 전이 영역은 ARAP가 변을 보존하므로(변환 뒤에 재야 겨드랑이·견갑골 주변의 정상적인 늘어남이 걸리지 않는다) 변환을 먼저 끝낸다.
        ptr, adjacency = vertex_adjacency(canon_triangles, len(conformed))
        moved = convert_to_t_pose(conformed, joints, weights, rig, ptr, adjacency)
        torn = gf.stretched_faces(conformed, moved, canon_triangles, ratio=TEAR_RATIO, min_length=TEAR_MIN_LENGTH_M)
        torn_faces = int(torn.sum())
        full_canon_index, full_triangles = canon_index, mesh.triangles  # 육안 확인용(떼어 낸 삼각형을 붉게 그린다)
        if torn_faces:
            keep = ~torn
            keep[np.flatnonzero(keep)[gf.spike_faces(canon_triangles[keep])]] = False  # 떼어 낸 자리에 남은 가는 가시(한 변으로만 이어진 삼각형)를 깎는다
            keep[np.flatnonzero(keep)[gf.small_island_faces(canon_triangles[keep], len(conformed))]] = False  # 떼어 내고 남은 작은 파편도 버린다
            canon_triangles = canon_triangles[keep]
            kept_triangles = mesh.triangles[keep]
            # 떼어 낸 뒤 어느 삼각형에도 쓰이지 않는 정점(법선 0 — 검증기 V20 오류)은 메시에서 뺀다. 대표 정점(canon) 배열은 그대로 두고 정점→대표 번호만 줄인다.
            used = np.unique(kept_triangles)
            remap = np.full(len(mesh.positions), -1, dtype=np.int64)
            remap[used] = np.arange(len(used))
            mesh = replace(
                mesh,
                positions=mesh.positions[used],
                normals=None if mesh.normals is None else mesh.normals[used],
                uvs=mesh.uvs[used],
                triangles=remap[kept_triangles],
            )
            canon_index = canon_index[used]
            edges = gf.undirected_edges(canon_triangles)
            open_edge = gf.boundary_vertex_mask(len(conformed), canon_triangles)
            torn_faces = int((~keep).sum())
            debug_torn = {"triangles": full_triangles[~keep], "canon_index": full_canon_index, "positions": mesh_positions_full}
        rest_canon = gf.conform(moved, edges, open_edge, surface_t, d_min_for(moved), 1.0e9, passes=2, smooth_iterations=4)

    # morph 델타: T-포즈 몸에 법선 호환으로 결합해 꼭짓점 델타를 무게중심으로 보간한다. 법선 회전까지 평가하면 오프셋(8~30 mm)×회전각만큼
    # 몸 정점 델타와 어긋나 검증기 V9(몸 최근접 정점 델타와의 차) 오차가 커지므로, morph(작은 변형)에는 평행이동 성분만 쓴다.
    normals_t = gf.orient_outward(rest_canon, vertex_normals(rest_canon, canon_triangles), surface_t)
    binding, _ = gf.bind_compatible(rest_canon, normals_t, surface_t)
    corners = bs.triangles[binding.triangle]
    deltas: dict[str, np.ndarray] = {}
    bound_deltas: dict[str, np.ndarray] = {}
    reference = nearest_body_reference(rest_canon, bs) if spec["role"] in ("top", "bottom", "shoes") else None
    for name in names:
        bound = fade_small(np.einsum("mc,mck->mk", binding.bary, bs.morphs[name][corners]))
        bound_deltas[name] = bound
        if reference is not None:
            # 검증기 V9(`verifyMorphFollow`)는 정점마다 TS_Body에서 가장 가까운 정점(반경 6 cm)의 델타와 비교한다. 칼라처럼 TS_Body 윗고리보다 높은
            # 정점은 결합 델타(머리·목 표면)와 그 기준이 다르므로(neckLength ±40 %에서 최대 3 cm), 같은 대응을 쓴다. 반경 밖은 결합 델타를 쓴다.
            delta = np.where(reference["found"][:, None], reference["deltas"][name], bound)
        else:
            delta = bound
        # 검증기 V9는 `param:*` 타깃마다 최대 델타 ≥ 1e-5 m와 `+` ≠ `−`를 요구한다(발·다리에 붙은 의상은 팔·목·머리 필드가 0). 베이스와 같은 규칙으로
        # 한 정점에만 부호 있는 0.03 mm를 더한다(모든 정점에 더하면 sparse accessor가 깨져 파일이 커진다).
        deltas[name] = ensure_min_delta(delta, name, rest_canon, [], spec["name"])
    binding_gap = {name: float(np.linalg.norm(bound_deltas[name] - deltas[name], axis=1).max()) for name in names} if reference is not None else {}
    return {
        "mesh": mesh,
        "canon_index": canon_index,
        "canon_count": len(canon_positions),
        "rest": rest_canon,
        "apose": conformed,
        "deltas": deltas,
        "joints": joints,
        "weights": weights,
        "binding": binding,
        "compatible_fraction": compat_ratio,
        "binding_gap_m": binding_gap,
        "transforms": transforms,
        "piece_reports": piece_reports,
        "sleeve_report": sleeve_report,
        "bang_report": bang_report,
        "torn_faces": torn_faces,
        "debug_torn": debug_torn,
    }


def nearest_body_reference(rest: np.ndarray, bs: BodySurface, radius: float = 0.06) -> dict:
    """의상 정점마다 TS_Body(몸 메시만)에서 가장 가까운 정점을 찾아 그 정점의 morph 델타를 돌려준다(검증기 V9와 같은 대응)."""
    import bpy  # noqa: F401 - mathutils는 bpy 뒤에만 가져올 수 있다
    from mathutils import kdtree

    count = bs.body_vertex_count
    body_positions = bs.tpose[:count]
    tree = kdtree.KDTree(count)
    for i, p in enumerate(body_positions.tolist()):
        tree.insert(p, i)
    tree.balance()
    nearest = np.full(len(rest), -1, dtype=np.int64)
    for v, p in enumerate(rest.tolist()):
        _, index, dist = tree.find(p)
        if dist <= radius:
            nearest[v] = index
    found = nearest >= 0
    deltas = {name: np.where(found[:, None], bs.morphs[name][:count][np.maximum(nearest, 0)], 0.0) for name in bs.morphs}
    return {"found": found, "nearest": nearest, "deltas": deltas}


def merge_skin_joints(joints: np.ndarray, weights: np.ndarray, names: list[str], merge: dict[str, str]) -> tuple[np.ndarray, np.ndarray]:
    """스킨의 joint를 다른 joint로 합친다(예: 턱 본 → 머리 본). 합친 뒤 같은 joint의 가중치를 더하고 상위 4개로 다시 줄인다."""
    if not merge:
        return joints, weights
    remap = np.arange(len(names))
    for source, target in merge.items():
        remap[names.index(source)] = names.index(target)
    new_joints = np.zeros_like(joints)
    new_weights = np.zeros_like(weights)
    for row in range(len(joints)):
        accum: dict[int, float] = {}
        for j, w in zip(remap[joints[row]].tolist(), weights[row].tolist(), strict=True):
            if w > 0.0:
                accum[j] = accum.get(j, 0.0) + w
        ranked = sorted(accum.items(), key=lambda item: -item[1])[:4]
        total = sum(w for _, w in ranked)
        for slot, (j, w) in enumerate(ranked):
            new_joints[row, slot] = j
            new_weights[row, slot] = w / total
    return new_joints, new_weights


def covered_regions(rest: np.ndarray, triangles: np.ndarray, base: BaseModel) -> dict[str, float]:
    """TS_Body(T-포즈) 영역별로, 몸 정점에서 바깥 법선 방향으로 쏜 광선이 의상 표면에 닿는 정점의 비율을 잰다.

    가장 가까운 점이 아니라 법선 광선을 쓰는 이유: 칼라·소매·밑단 같은 열린 가장자리 바로 바깥의 노출된 피부가
    "가까워서 덮인 것"으로 잘못 세지 않게 하려는 것이다.
    """
    body = base.mesh("body_")
    garment = Surface(rest, triangles)
    positions = body["tpose_positions"].astype(np.float64)
    normals = body["normals"].astype(np.float64)
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = normals / np.maximum(length, 1e-12)
    hits, triangle = garment.ray(positions + normals * 1e-4, normals, HIDE_DISTANCE_M)
    distance = np.linalg.norm(hits - positions, axis=1)
    covered = (triangle >= 0) & (distance <= HIDE_DISTANCE_M)
    fractions: dict[str, float] = {}
    for index, name in enumerate(base.region_ids):
        mask = body["region"] == index
        if mask.any():
            fractions[name] = float(covered[mask].mean())
    return fractions


def weld_for_strands(result: dict) -> dict:
    """UV 섬마다 쪼개진 정점을 위치(대표 정점) 기준으로 합친다. 헤어의 정점 수가 삼각형 수의 약 2배에서 약 1배로 준다."""
    mesh: StaticMesh = result["mesh"]
    triangles = result["canon_index"][mesh.triangles]
    keep = (triangles[:, 0] != triangles[:, 1]) & (triangles[:, 1] != triangles[:, 2]) & (triangles[:, 0] != triangles[:, 2])
    triangles = triangles[keep]
    used = np.unique(triangles)
    remap = np.full(result["canon_count"], -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    welded = replace(mesh, positions=result["rest"][used], normals=None, uvs=np.zeros((len(used), 2)), triangles=remap[triangles])
    out = dict(result)
    out.update(mesh=welded, canon_index=used)
    return out


def cylindrical_uvs(positions: np.ndarray, low: np.ndarray, high: np.ndarray) -> np.ndarray:
    """머리 중심축(y) 둘레 각도를 u, 높이를 v로 하는 원통 UV. 이음매(등 중앙)를 가로지르는 삼각형은 가닥 노이즈를 훑고 지나가므로 눈에 띄지 않는다."""
    center_x, center_z = 0.5 * (low[0] + high[0]), 0.5 * (low[2] + high[2])
    angle = np.arctan2(positions[:, 0] - center_x, positions[:, 2] - center_z)
    u = angle / (2.0 * np.pi) + 0.5
    v = (high[1] - positions[:, 1]) / max(float(high[1] - low[1]), 1e-6)
    return np.stack([u, v], axis=1)


def write_part_glb(spec: dict, results: list[dict], base: BaseModel, texture_jpeg: bytes, path: Path, names: list[str]) -> int:
    # morph 델타는 정규화 SHORT(KHR_mesh_quantization, 해상도 0.03 mm)로 쓴다 — 파츠 한도 1.5 MiB를 위해서다(float32 조밀 델타가 파일의 절반이었다).
    writer = QuantizedGlbWriter(generator="toonstudio character_kit retarget_garment")
    joint_names = base.joint_names
    parents = {name: (None if parent < 0 else joint_names[parent]) for name, parent in zip(joint_names, base.joint_parents, strict=True)}
    writer.add_skeleton(joint_names, parents, base.arrays["joint_tpose"].astype(np.float64))
    texture = writer.add_texture(texture_jpeg, "image/jpeg", name=f"{spec['material']}_basecolor")
    material = writer.add_material(spec["material"], base_color_texture=texture, base_color_factor=(1.0, 1.0, 1.0, 1.0), double_sided=spec["double_sided"], metallic=0.0, roughness=0.8)
    for node, result in zip(spec["nodes"], results, strict=True):
        mesh: StaticMesh = result["mesh"]
        positions = result["rest"][result["canon_index"]]
        normals = gf.canonical_vertex_normals(result["canon_index"], result["canon_count"], positions, mesh.triangles)
        joints = result["joints"][result["canon_index"]]
        weights = result["weights"][result["canon_index"]]
        joints, weights = merge_skin_joints(joints, weights, joint_names, spec["merge_joints"])
        targets = [MorphTarget(name=name, position=result["deltas"][name][result["canon_index"]].astype(np.float32)) for name in names]
        writer.add_mesh_node(
            node,
            [
                Primitive(
                    positions=positions.astype(np.float32),
                    indices=mesh.triangles,
                    normals=normals.astype(np.float32),
                    uvs=mesh.uvs.astype(np.float32),
                    joints=joints.astype(np.uint8),
                    weights=weights.astype(np.float32),
                    material=material,
                    targets=targets,
                )
            ],
            skinned=True,
        )
        result["written_joints"] = joints
        result["written_weights"] = weights
    path.parent.mkdir(parents=True, exist_ok=True)
    return writer.write(str(path))


def write_debug_apose(path: Path, results: list[dict], bs: BodySurface) -> None:
    """A-포즈 몸 + 맞춘 의상을 정적 GLB로 낸다(육안 확인용)."""
    writer = GlbWriter(generator="retarget_garment debug")
    skin = writer.add_material("body", base_color_factor=(0.86, 0.66, 0.56, 1.0))
    cloth = writer.add_material("garment", base_color_factor=(0.55, 0.62, 0.78, 1.0), double_sided=True)
    writer.add_mesh_node("BodyA", [Primitive(positions=bs.apose.astype(np.float32), indices=bs.triangles, normals=vertex_normals(bs.apose, bs.triangles).astype(np.float32), material=skin)], skinned=False)
    torn_material = writer.add_material("torn", base_color_factor=(0.9, 0.1, 0.1, 1.0), double_sided=True)
    for index, result in enumerate(results):
        mesh: StaticMesh = result["mesh"]
        positions = result["apose"][result["canon_index"]]
        normals = gf.canonical_vertex_normals(result["canon_index"], result["canon_count"], positions, mesh.triangles)
        writer.add_mesh_node(f"Garment{index}", [Primitive(positions=positions.astype(np.float32), indices=mesh.triangles, normals=normals.astype(np.float32), material=cloth)], skinned=False)
        torn = result.get("debug_torn")
        if torn is not None and len(torn["triangles"]):
            torn_positions = result["apose"][torn["canon_index"]]
            torn_normals = gf.canonical_vertex_normals(torn["canon_index"], result["canon_count"], torn_positions, torn["triangles"])
            writer.add_mesh_node(f"Torn{index}", [Primitive(positions=torn_positions.astype(np.float32), indices=torn["triangles"], normals=torn_normals.astype(np.float32), material=torn_material)], skinned=False)
    writer.write(str(path))


def flag_values(args: list[str], name: str) -> list[str]:
    return [args[i + 1] for i, token in enumerate(args) if token == name and i + 1 < len(args)]


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    preset_id = flag_values(args, "--preset")[0]
    spec = dict(PRESETS[preset_id])
    # 실험용: `--override 키=JSON값`으로 프리셋 필드를 이번 실행에만 바꾼다(예: --override sleeve_chain=false). 표는 건드리지 않는다.
    for item in flag_values(args, "--override"):
        key, _, value = item.partition("=")
        spec[key] = json.loads(value)
    base_path = flag_values(args, "--base-model")[0]
    garments = flag_values(args, "--garment")
    kit_dir = Path(flag_values(args, "--kit-dir")[0])
    base_id = (flag_values(args, "--base") or ["female"])[0]
    if len(garments) != len(spec["nodes"]):
        raise SystemExit(f"{preset_id}: --garment는 {len(spec['nodes'])}개(LOD 순서)여야 한다")

    frame_from = (flag_values(args, "--frame-from") or [None])[0]
    if spec["align"] in ("frame", "head_ref"):
        if not frame_from:
            raise SystemExit(f"{preset_id}: align={spec['align']}은 --frame-from <clean-report.json>이 필요하다")
        spec = dict(spec)
        clean_report = json.loads(Path(frame_from).read_text(encoding="utf-8"))
        spec["_frame"] = clean_report["sourceBoundsGltf"]
        spec["_ref"] = clean_report.get("referenceHeadGltf")
        if spec["align"] == "head_ref" and not spec["_ref"]:
            raise SystemExit(f"{preset_id}: align=head_ref는 프리셋 source.ref(머리 메시)로 만든 clean 보고서가 필요하다")
    base = load_base_model(base_path)
    names = morph_names(spec["morph_scope"])
    bs = build_body_surface(base, names)
    volume = gf.mesh_signed_volume(bs.apose, bs.triangles)
    if volume <= 0:
        raise SystemExit("몸 삼각형 감김이 안쪽이다(부호 있는 부피 ≤ 0)")
    surface = Surface(bs.apose, bs.triangles)
    surface_t = Surface(bs.tpose, bs.triangles)
    names_all = base.joint_names
    parents = list(base.joint_parents)
    joints_a = {name: base.arrays["joint_apose"][i].astype(np.float64) for i, name in enumerate(names_all)}
    rig = build_rig(joints_a, names_all, {name: (None if parents[i] < 0 else names_all[parents[i]]) for i, name in enumerate(names_all)})

    meshes = [read_static_mesh(path) for path in garments]
    results: list[dict] = []
    transforms = None
    for mesh in meshes:
        result = retarget_one(mesh, spec, bs, surface, surface_t, rig, parents, names, transforms)
        transforms = result["transforms"]  # LOD들은 같은 정렬을 쓴다
        results.append(result)

    if spec.get("uv") == "strands":
        # 헤어: 정점을 합치고 원통 UV + 가닥 줄무늬 텍스처를 새로 만든다(원본 UV 섬이 잘게 쪼개져 정점이 두 배로 늘고 파츠 한도를 넘는다).
        results = [weld_for_strands(result) for result in results]
        rest_first = results[0]["rest"][results[0]["canon_index"]]
        low, high = rest_first.min(axis=0), rest_first.max(axis=0)
        for result in results:
            positions_lod = result["rest"][result["canon_index"]]
            result["mesh"] = replace(result["mesh"], uvs=cylindrical_uvs(positions_lod, low, high))
        uv_triangles = np.concatenate([result["mesh"].uvs[result["mesh"].triangles] for result in results])
        texture_jpeg, texture_stats = strand_texture(uv_triangles, TextureStyle(**spec["texture"]))
    else:
        # 텍스처: 첫 LOD의 원본 이미지를 쓰고, 모든 LOD의 UV가 쓰는 영역을 합쳐 재매긴다.
        uv_triangles = np.concatenate([m.uvs[m.triangles] for m in meshes])
        image_bytes = meshes[0].image
        if image_bytes is None:
            raise SystemExit("기본색 텍스처가 없다")
        texture_jpeg, texture_stats = relative_color_texture(image_bytes, uv_triangles, TextureStyle(**spec["texture"]))

    out_path = kit_dir / "parts" / base_id / spec["slot"] / f"{spec['name']}.glb"
    size = write_part_glb(spec, results, base, texture_jpeg, out_path, names)

    # V9 자체 검증: 상의·하의·신발은 TS_Body를 기준으로 morph를 따라가는지 잰다(헤어는 V9가 재지 않는다).
    follow = None
    if spec["role"] in ("top", "bottom", "shoes"):
        body = base.mesh("body_")
        ref_names = [str(v) for v in body["morph_names"]]
        reference_targets = {n: body["morph_delta"][ref_names.index(n)] for n in names if n in ref_names}
        first = results[0]
        positions = first["rest"][first["canon_index"]]
        subject_targets = {n: first["deltas"][n][first["canon_index"]] for n in names}
        follow = follow_deviation(positions, subject_targets, body["tpose_positions"].astype(np.float64), reference_targets, names=names)

    # hides: 영역 정점의 98.5 % 이상이 의상에 덮일 때만(헤어는 숨길 수 없다).
    hides: list[str] = []
    coverage: dict[str, float] = {}
    if spec["slot"] in ("top", "bottom", "shoes", "accessory"):
        first = results[0]
        coverage = covered_regions(first["rest"][first["canon_index"]], first["mesh"].triangles, base)
        hideable = [r for r in base.region_ids if r != "head"]
        hides = [r for r in hideable if coverage.get(r, 0.0) >= HIDE_COVERAGE]

    parts_json = (flag_values(args, "--parts-json") or [None])[0]
    if parts_json:
        # 일괄 빌드는 프리셋마다 별도 프로세스가 같은 JSON을 읽고 쓰므로 잠금 없이는 항목이 사라질 수 있다.
        import fcntl

        lock_path = Path(str(parts_json) + ".lock")
        with lock_path.open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            registry = json.loads(Path(parts_json).read_text(encoding="utf-8")) if Path(parts_json).exists() else {}
            registry.setdefault(preset_id, {})[base_id] = {"hides": hides}
            Path(parts_json).write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    debug_path = (flag_values(args, "--debug-apose") or [None])[0]
    if debug_path:
        write_debug_apose(Path(debug_path), results, bs)

    report = {
        "preset": preset_id,
        "output": str(out_path),
        "bytes": size,
        "withinPartBudget": size <= int(1.5 * 1024 * 1024),
        "lods": [
            {
                "node": node,
                "vertices": int(len(result["mesh"].positions)),
                "triangles": int(len(result["mesh"].triangles)),
                "pieces": result["piece_reports"],
                "sleeves": result.get("sleeve_report"),
                "bangs": result.get("bang_report"),
                "tornFaces": result.get("torn_faces", 0),
                "bindingGapMm": {k: round(v * 1000, 1) for k, v in result.get("binding_gap_m", {}).items() if v > 0.015},
            }
            for node, result in zip(spec["nodes"], results, strict=True)
        ],
        "texture": texture_stats,
        "morphCount": len(names),
        "hides": hides,
        "coverageByRegion": {k: round(v, 3) for k, v in coverage.items() if v > 0.02},
        "follow": None
        if follow is None
        else {"matched": follow["matched"], "unmatched": follow["unmatched"], "worst": follow["worst"], "errorOver15mm": [k for k, v in follow["perTarget"].items() if v["statistic"] > 0.015], "warnOver5mm": [k for k, v in follow["perTarget"].items() if v["statistic"] > 0.005]},
    }
    print("RETARGET_REPORT " + json.dumps(report, ensure_ascii=False))
    report_path = (flag_values(args, "--report") or [None])[0]
    if report_path:
        Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
