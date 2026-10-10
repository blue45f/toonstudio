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
from dataclasses import dataclass
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from character_kit import garment_fit as gf  # noqa: E402
from character_kit.base_assembly import BaseModel, follow_deviation, load_base_model  # noqa: E402
from character_kit.garment_presets import PRESETS, morph_names  # noqa: E402
from character_kit.garment_texture import TextureStyle, relative_color_texture  # noqa: E402
from character_kit.glbwriter import GlbWriter, MorphTarget, Primitive  # noqa: E402
from character_kit.gltf_read import StaticMesh, read_static_mesh  # noqa: E402
from character_kit.surface import Surface, vertex_normals  # noqa: E402

#: 이 값(m)보다 작은 morph 델타는 0으로 접어 sparse accessor로 쓴다(`base_assembly.FADE_LO/FADE_HI`와 같은 규칙).
FADE_LO = 2e-5
FADE_HI = 6e-5
#: 검증기 V9는 `param:*` morph의 최대 델타 ≥ 1e-5 m를 요구한다. 해당 morph가 의상 위치에 닿지 않으면 이 바닥(m)을 +Y로 더한다.
MIN_PARAM_DELTA_M = 3.0e-5
#: 몸 영역 정점의 이 비율 이상이 의상에 덮여야 그 영역을 숨긴다(`hides`).
HIDE_COVERAGE = 0.985
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
            scale, translation, cost = gf.fit_similarity(pts, surface, spec["icp"]["scales"], anchor_source, target)
            out.append({"scale": float(scale), "translation": translation, "cost": cost})
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


def retarget_one(mesh: StaticMesh, spec: dict, bs: BodySurface, surface: Surface, names: list[str], transforms: list[dict] | None = None) -> dict:
    """정리·축소된 메시 하나를 파츠 한 개(LOD)로 만든다. 결과 배열 묶음을 돌려준다."""
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
    transforms = transforms or align_pieces(spec, piece_points, bs, surface)
    conformed = canon_positions.copy()
    piece_reports = []
    for vertices, transform in zip(piece_vertices, transforms, strict=True):
        fitted = transform["scale"] * canon_positions[vertices] + transform["translation"]
        index_map = -np.ones(len(canon_positions), dtype=np.int64)
        index_map[vertices] = np.arange(len(vertices))
        keep = np.isin(edges[:, 0], vertices) & np.isin(edges[:, 1], vertices)
        sub_edges = index_map[edges[keep]]
        d_before, _, _ = gf.signed_distance(fitted, surface)
        out = gf.conform(fitted, sub_edges, open_edge[vertices], surface, spec["d_min"], spec["d_max"])
        d_after, _, _ = gf.signed_distance(out, surface)
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

    binding = gf.bind(conformed, surface)
    rest = gf.evaluate(binding, bs.tpose, bs.triangles)
    deltas: dict[str, np.ndarray] = {}
    for name in names:
        moved = gf.evaluate(binding, bs.tpose + bs.morphs[name], bs.triangles)
        delta = fade_small(moved - rest)
        if float(np.abs(delta).max()) < 1e-5:
            delta = delta + np.array([0.0, MIN_PARAM_DELTA_M, 0.0])
        deltas[name] = delta
    joints, weights = gf.transfer_skin(binding, bs.triangles, bs.joints, bs.weights)
    return {
        "mesh": mesh,
        "canon_index": canon_index,
        "canon_count": len(canon_positions),
        "rest": rest,
        "apose": conformed,
        "deltas": deltas,
        "joints": joints,
        "weights": weights,
        "binding": binding,
        "transforms": transforms,
        "piece_reports": piece_reports,
    }


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
    """TS_Body(T-포즈) 영역별로, 의상 표면 바로 뒤(안쪽)에 있는 정점의 비율을 잰다."""
    body = base.mesh("body_")
    garment = Surface(rest, triangles)
    positions = body["tpose_positions"].astype(np.float64)
    hits = garment.closest(positions, max_distance=HIDE_DISTANCE_M)
    found = hits.triangle >= 0
    inside = np.zeros(len(positions), dtype=bool)
    if found.any():
        offset = positions[found] - hits.point[found]
        inside[found] = np.einsum("ij,ij->i", offset, hits.normal[found]) < 0.0
    covered = inside & found
    fractions: dict[str, float] = {}
    for index, name in enumerate(base.region_ids):
        mask = body["region"] == index
        if mask.any():
            fractions[name] = float(covered[mask].mean())
    return fractions


def write_part_glb(spec: dict, results: list[dict], base: BaseModel, texture_jpeg: bytes, path: Path, names: list[str]) -> int:
    writer = GlbWriter(generator="toonstudio character_kit retarget_garment")
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
    for index, result in enumerate(results):
        mesh: StaticMesh = result["mesh"]
        positions = result["apose"][result["canon_index"]]
        normals = gf.canonical_vertex_normals(result["canon_index"], result["canon_count"], positions, mesh.triangles)
        writer.add_mesh_node(f"Garment{index}", [Primitive(positions=positions.astype(np.float32), indices=mesh.triangles, normals=normals.astype(np.float32), material=cloth)], skinned=False)
    writer.write(str(path))


def flag_values(args: list[str], name: str) -> list[str]:
    return [args[i + 1] for i, token in enumerate(args) if token == name and i + 1 < len(args)]


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    preset_id = flag_values(args, "--preset")[0]
    spec = PRESETS[preset_id]
    base_path = flag_values(args, "--base-model")[0]
    garments = flag_values(args, "--garment")
    kit_dir = Path(flag_values(args, "--kit-dir")[0])
    base_id = (flag_values(args, "--base") or ["female"])[0]
    if len(garments) != len(spec["nodes"]):
        raise SystemExit(f"{preset_id}: --garment는 {len(spec['nodes'])}개(LOD 순서)여야 한다")

    base = load_base_model(base_path)
    names = morph_names(spec["morph_scope"])
    bs = build_body_surface(base, names)
    volume = gf.mesh_signed_volume(bs.apose, bs.triangles)
    if volume <= 0:
        raise SystemExit("몸 삼각형 감김이 안쪽이다(부호 있는 부피 ≤ 0)")
    surface = Surface(bs.apose, bs.triangles)

    meshes = [read_static_mesh(path) for path in garments]
    results: list[dict] = []
    transforms = None
    for mesh in meshes:
        result = retarget_one(mesh, spec, bs, surface, names, transforms)
        transforms = result["transforms"]  # LOD들은 같은 정렬을 쓴다
        results.append(result)

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
