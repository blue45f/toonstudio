"""의상을 HBM A-포즈 몸에 맞춰 보는 디버그 드라이버 (정렬·밀착 품질 확인용).

사용:
    <venv>/bin/python -I fit_apose_debug.py <HBM npz> <의상.glb> <출력.glb> --preset tee|jeans|hair|sneakers [--report 보고서.json]

몸과 맞춘 의상을 정적 GLB 한 개(몸 + 의상, 색만 다름)로 내보내 `render_preview.py`로 육안 확인한다.
수치(스케일·이동·침투 비율·거리 분포)는 표준 출력의 `FIT_REPORT` 한 줄로 낸다.
의상이 여러 덩어리(스니커즈 한 켤레)면 덩어리마다 따로 맞춘다.
"""

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from character_kit import garment_fit as gf  # noqa: E402
from character_kit import hbm  # noqa: E402
from character_kit.glbwriter import GlbWriter, Primitive  # noqa: E402
from character_kit.gltf_read import read_static_mesh  # noqa: E402
from character_kit.surface import Surface, vertex_normals  # noqa: E402

# 프리셋별 초기 정렬 힌트와 밀착 한계. 높이·위치는 HBM 여성 몸 실측(키 1.639 m, 흉부 상단 y 1.52, 골반 y 0.754~0.953)에서 잡았다.
# `surface_sets`는 맞출 몸 표면의 HBM 해부학 분할 번호(None이면 몸 전체), `pieces`는 덩어리별로 따로 맞출지 여부다.
PRESETS = {
    "tee": {"anchor": "top", "target": (0.0, 1.44, 0.03), "scales": [0.30, 0.33, 0.36, 0.39, 0.42], "d_min": 0.004, "d_max": 0.030, "surface_sets": None, "pieces": False},
    "jeans": {"anchor": "top", "target": (0.0, 0.97, 0.02), "scales": [0.46, 0.50, 0.54, 0.58, 0.62], "d_min": 0.004, "d_max": 0.030, "surface_sets": None, "pieces": False},
    # 헤어: 머리 표면만. 정수리 중심을 머리 꼭대기(y 1.639)보다 조금 위에 둔다. 볼륨을 지키려고 d_max를 크게 둔다.
    "hair": {"anchor": "top", "target": (0.0, 1.655, 0.045), "scales": [0.16, 0.18, 0.20, 0.22, 0.24], "d_min": 0.006, "d_max": 1.0e9, "surface_sets": None, "pieces": False, "align": "hair"},
    # 스니커즈: 발 표면(발·앞발·발가락·종아리 아래쪽)에, 두 켤레를 각자. 신발 밑창이 발바닥보다 조금 아래로 내려간다.
    "sneakers": {"anchor": "bottom", "target": None, "scales": None, "d_min": 0.003, "d_max": 1.0e9, "surface_sets": "foot", "pieces": True, "align": "shoes"},
}


def triangulate(quads):
    return np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]]).astype(np.int64)


def flag(args, name, default=None):
    return args[args.index(name) + 1] if name in args else default


def sets_for(name):
    if name == "head":
        return set(hbm.HEAD_SETS)
    if name == "foot":
        return set(hbm.FOOT_SETS) | set(hbm.FOREFOOT_SETS) | set(hbm.TOE_SETS) | set(hbm.CALF_SETS)
    return None


def subsurface(body, tris_all, face_sets, side=None):
    """해부학 분할 번호 집합에 속한 면(좌우 지정 가능)만으로 Surface를 만든다. 정점은 전체를 유지한다."""
    if face_sets is None:
        return Surface(body.positions, tris_all), np.ones(len(tris_all), dtype=bool)
    quad_mask = np.isin(body.face_set, list(face_sets))
    if side is not None:
        quad_mask &= (body.face_center[:, 0] * side) > 0
    tri_mask = np.concatenate([quad_mask, quad_mask])
    return Surface(body.positions, tris_all[tri_mask]), tri_mask


def stats(d, d_min):
    return {
        "meanAbs": round(float(np.abs(d).mean()), 4),
        "p05": round(float(np.percentile(d, 5)), 4),
        "p50": round(float(np.percentile(d, 50)), 4),
        "p95": round(float(np.percentile(d, 95)), 4),
        "penetratingPct": round(float((d < 0.0).mean() * 100), 2),
        "below_dmin_pct": round(float((d < d_min - 1e-4).mean() * 100), 2),
    }


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    npz_path, garment_path, out_path = args[0], args[1], args[2]
    name = flag(args, "--preset")
    preset = PRESETS[name]

    body = hbm.load(npz_path)
    # 사각형 → 삼각형: 앞 절반이 [0,1,2], 뒤 절반이 [0,2,3] 이므로 면 인덱스 f는 f와 f+M에 대응한다.
    tris_all = triangulate(body.faces)
    volume = gf.mesh_signed_volume(body.positions, tris_all)
    if volume <= 0:
        tris_all = tris_all[:, ::-1].copy()

    mesh = read_static_mesh(garment_path)
    canon_index, canon_positions = gf.weld_vertices(mesh.positions)
    canon_tris = canon_index[mesh.triangles]
    edges = gf.undirected_edges(canon_tris)
    open_edge = gf.boundary_vertex_mask(len(canon_positions), canon_tris)

    # 덩어리(연결 성분) 라벨: 정점 단위
    pieces = [np.arange(len(canon_positions))]
    if preset["pieces"]:
        parent = list(range(len(canon_positions)))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for a, b, c in canon_tris.tolist():
            for other in (b, c):
                ra, ro = find(a), find(other)
                if ra != ro:
                    parent[ro] = ra
        labels = np.array([find(i) for i in range(len(canon_positions))])
        order = np.argsort(-np.unique(labels, return_counts=True)[1])
        values = np.unique(labels)
        pieces = [np.flatnonzero(labels == values[i]) for i in order[:2]]

    # 신발 한 켤레는 같은 스케일을 쓴다: 두 발 평균 길이의 1.12배를 두 신발 평균 길이에 맞춘다.
    shoe_scale = None
    if preset.get("align") == "shoes":
        foot_lengths = []
        for sign in (1.0, -1.0):
            quad_mask = np.isin(body.face_set, list(set(hbm.FOOT_SETS) | set(hbm.FOREFOOT_SETS) | set(hbm.TOE_SETS))) & ((body.face_center[:, 0] * sign) > 0)
            foot_only = body.positions[np.unique(body.faces[quad_mask].ravel())]
            foot_lengths.append(foot_only[:, 2].max() - foot_only[:, 2].min())
        shoe_lengths = [piece_points[:, 2].max() - piece_points[:, 2].min() for piece_points in (canon_positions[piece] for piece in pieces)]
        shoe_scale = 1.12 * float(np.mean(foot_lengths)) / float(np.mean(shoe_lengths))

    conformed = canon_positions.copy()
    piece_reports = []
    face_sets = sets_for(preset["surface_sets"]) if preset["surface_sets"] else None
    for piece in pieces:
        pts = canon_positions[piece]
        side = None
        if preset["pieces"]:
            side = 1.0 if pts[:, 0].mean() > 0 else -1.0  # 신발 한 짝이 어느 쪽 발인지: 모델의 +x는 캐릭터 왼쪽
        surface, _ = subsurface(body, tris_all, face_sets, side)
        if name == "sneakers":
            # 발 표면 정점의 경계 상자로 발 중심·길이를 잡는다.
            quad_mask = np.isin(body.face_set, list(sets_for("foot"))) & ((body.face_center[:, 0] * side) > 0)
            foot_vertices = np.unique(body.faces[quad_mask].ravel())
            foot = body.positions[foot_vertices]
            toe_sets = np.isin(body.face_set, list(set(hbm.FOOT_SETS) | set(hbm.FOREFOOT_SETS) | set(hbm.TOE_SETS))) & ((body.face_center[:, 0] * side) > 0)
            foot_only = body.positions[np.unique(body.faces[toe_sets].ravel())]
            length = foot_only[:, 2].max() - foot_only[:, 2].min()
            shoe_length = pts[:, 2].max() - pts[:, 2].min()
            s0 = 1.12 * length / shoe_length
            anchor_source = np.array([0.5 * (pts[:, 0].min() + pts[:, 0].max()), pts[:, 1].min(), 0.5 * (pts[:, 2].min() + pts[:, 2].max())])
            anchor_target = np.array([0.5 * (foot_only[:, 0].min() + foot_only[:, 0].max()), foot_only[:, 1].min() - 0.012, 0.5 * (foot_only[:, 2].min() + foot_only[:, 2].max())])
            scales = [s0 * f for f in (0.85, 0.92, 1.0, 1.08, 1.16)]
        else:
            anchor_source = np.array([0.5 * (pts[:, 0].min() + pts[:, 0].max()), pts[:, 1].max(), 0.5 * (pts[:, 2].min() + pts[:, 2].max())])
            anchor_target = np.array(preset["target"])
            scales = preset["scales"]
        align = preset.get("align", "icp")
        if align == "hair":
            # 머리 너비(+양쪽 3 cm 여유)에 헤어 너비를 맞추고, 정수리 위에 얹고, 앞뒤는 머리 상자 중심에 맞춘다.
            head_vertices = body.positions[np.unique(body.faces[np.isin(body.face_set, list(hbm.HEAD_SETS))].ravel())]
            head_width = head_vertices[:, 0].max() - head_vertices[:, 0].min()
            scale = (head_width + 0.06) / (pts[:, 0].max() - pts[:, 0].min())
            center = np.array([0.5 * (pts[:, 0].min() + pts[:, 0].max()), pts[:, 1].max(), 0.5 * (pts[:, 2].min() + pts[:, 2].max())])
            goal = np.array([0.0, head_vertices[:, 1].max() + 0.025, 0.5 * (head_vertices[:, 2].min() + head_vertices[:, 2].max()) - 0.005])
            translation = goal - scale * center
            cost = float("nan")
        elif align == "shoes":
            scale, translation, cost = shoe_scale, anchor_target - shoe_scale * anchor_source, float("nan")
        else:
            scale, translation, cost = gf.fit_similarity(pts, surface, scales, anchor_source, anchor_target)
        fitted = scale * pts + translation
        sub_edges = None
        index_map = -np.ones(len(canon_positions), dtype=np.int64)
        index_map[piece] = np.arange(len(piece))
        mask = np.isin(edges[:, 0], piece) & np.isin(edges[:, 1], piece)
        sub_edges = index_map[edges[mask]]
        d_before, _, _ = gf.signed_distance(fitted, surface)
        out = gf.conform(fitted, sub_edges, open_edge[piece], surface, preset["d_min"], preset["d_max"])
        d_after, _, _ = gf.signed_distance(out, surface)
        conformed[piece] = out
        piece_reports.append(
            {
                "vertices": int(len(piece)),
                "side": side,
                "scale": round(float(scale), 5),
                "translation": [round(float(v), 5) for v in translation],
                "fitCost": None if cost != cost else round(cost, 5),
                "afterSimilarity": stats(d_before, preset["d_min"]),
                "afterConform": stats(d_after, preset["d_min"]),
            }
        )

    report = {
        "preset": name,
        "bodySignedVolume": round(volume, 5),
        "garmentVertices": int(len(mesh.positions)),
        "canonicalVertices": int(len(canon_positions)),
        "openEdgeVertices": int(open_edge.sum()),
        "pieces": piece_reports,
    }
    print("FIT_REPORT " + json.dumps(report))
    report_path = flag(args, "--report")
    if report_path:
        with open(report_path, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)

    final = conformed[canon_index]
    normals = gf.canonical_vertex_normals(canon_index, len(canon_positions), final, mesh.triangles)
    writer = GlbWriter(generator="fit_apose_debug")
    skin_material = writer.add_material("body", base_color_factor=(0.86, 0.66, 0.56, 1.0), double_sided=False)
    garment_material = writer.add_material("garment", base_color_factor=(0.55, 0.62, 0.78, 1.0), double_sided=True)
    writer.add_mesh_node(
        "BodyA",
        [Primitive(positions=body.positions.astype(np.float32), indices=tris_all, normals=vertex_normals(body.positions, tris_all).astype(np.float32), material=skin_material)],
        skinned=False,
    )
    writer.add_mesh_node(
        "Garment",
        [Primitive(positions=final.astype(np.float32), indices=mesh.triangles, normals=normals.astype(np.float32), material=garment_material)],
        skinned=False,
    )
    writer.write(out_path)


if __name__ == "__main__":
    main()
