"""Hyper3D(Rodin) 의상 원본 정리 (Blender 헤드리스).

사용:
    blender --background --python clean_rodin_garment.py -- <원본.glb> <출력.glb> --preset tee|jeans|hair|sneakers [--report 보고서.json]

Rodin은 의상만 달라고 해도 마네킹 목·허리·발목·신발 조각을 같은 메시에 붙여 낸다. 이 스크립트는 베이스 바디와 무관한
단계로, 텍스처 색과 높이 기준으로 그런 조각을 지우고 의상 셸 중 가장 큰 덩어리만 남긴다. 기준은 프리셋별 규칙이며
2026-10-11 생성물(tshirt-01, jeans-01)의 면 단위 색·높이 분포를 실측해 정했다(수치 근거는 tools/blender/character_kit/README.md).
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import (  # noqa: E402
    base_color_image,
    canonical_triangles,
    cli_args,
    delete_faces_and_keep_largest_island,
    export_glb,
    face_components,
    fill_small_holes,
    face_table,
    flag_value,
    grow_region,
    image_rgb,
    import_glb,
    mesh_objects,
    reset_scene,
    rgb_to_hsv,
    world_bounds,
    write_report,
)


def rule_tee(hsv, z_norm, face_vertices):
    """티셔츠: 셔츠는 무채색(채도 ≈ 0.01)이고 마네킹 목 조각만 갈색(색상 0~70°, 채도 ≥ 0.15)이다."""
    warm = (hsv[:, 0] < 70.0) & (hsv[:, 1] >= 0.15)
    return warm, {"rule": "warm-saturated faces are the mannequin neck stump"}


def rule_jeans(hsv, z_norm, face_vertices):
    """청바지: 데님(색상 170~270°, 채도 > 0.15)의 높이 범위 밖은 마네킹 피부(위)와 신발·발목(아래)이다. 벨트는 범위 안이라 남긴다."""
    denim = (hsv[:, 0] > 170.0) & (hsv[:, 0] < 270.0) & (hsv[:, 1] > 0.15)
    z_low = float(z_norm[denim].min())
    z_high = float(z_norm[denim].max())
    margin = 0.004
    outside = (z_norm < z_low - margin) | (z_norm > z_high + margin)
    # 범위 안에 남는 마네킹 피부 조각(허리 안쪽·밑단 발목): 베이지색(색상 10~60°, 채도 0.05~0.45, 명도 ≥ 0.72). 벨트(채도 ≥ 0.76)는 걸리지 않는다.
    skin = (hsv[:, 0] >= 10.0) & (hsv[:, 0] <= 60.0) & (hsv[:, 1] >= 0.05) & (hsv[:, 1] <= 0.45) & (hsv[:, 2] >= 0.72)
    return outside | skin, {
        "denimFaces": int(denim.sum()),
        "zLow": round(z_low, 4),
        "zHigh": round(z_high, 4),
        "margin": margin,
        "skinFacesInsideRange": int((skin & ~outside).sum()),
    }


def rule_hair(hsv, z_norm, face_vertices):
    """헤어: Rodin은 머리·목·어깨·검정 상의가 붙은 흉상을 낸다. 머리카락은 어두운 갈색(명도 < 0.40, 채도 > 0.25,
    색상 340~50°)이 씨앗이다. 하이라이트로 밝아진 머리카락(명도 < 0.62의 갈색, 또는 채도와 무관한 명도 < 0.5의 어두운 면)은
    씨앗에 이어진 것만 영역 성장으로 포함하고, 목·어깨(정규화 높이 < 0.30)는 후보에서 뺀다.
    눈썹·속눈썹 같은 작은 조각은 가장 큰 덩어리만 남기며 버린다."""
    brown = (hsv[:, 1] > 0.25) & ((hsv[:, 0] < 50.0) | (hsv[:, 0] > 340.0))
    above_neck = z_norm > 0.30
    # 이마 선 위(정규화 높이 > 0.82)는 얼굴 피부가 없으므로 색과 무관하게 머리카락이다(밝은 하이라이트 띠가 여기 몰려 있다).
    crown = z_norm > 0.82
    seeds = (brown & (hsv[:, 2] < 0.40) & above_neck) | crown
    # 하이라이트 가닥은 어둡지만 채도가 낮은 회갈색(S 0.1~0.25)이라 어두운 면(명도 < 0.46)은 채도와 상관없이 후보다.
    # 머리 안쪽의 주황 피부 잔재(명도 0.5~0.65, 채도 0.55~0.7)는 채도 < 0.50·명도 < 0.55 조건으로 걸러낸다.
    candidates = ((hsv[:, 2] < 0.46) | (brown & (hsv[:, 2] < 0.55) & (hsv[:, 1] < 0.50))) & above_neck
    hair = grow_region(seeds, candidates, face_vertices)
    # 머리카락에 완전히 둘러싸인 작은 비머리 조각(가는 틈)은 머리카락으로 채운다. 얼굴·목처럼 큰 성분은 그대로 둔다.
    labels, sizes = face_components(~hair, face_vertices)
    small = np.flatnonzero(sizes < 400)
    filled = np.isin(labels, small) & (z_norm > 0.30)
    hair = hair | filled
    return ~hair, {
        "rule": "dark brown seeds grown into connected highlights, small enclosed gaps filled",
        "seedFaces": int(seeds.sum()),
        "filledFaces": int(filled.sum()),
        "hairFaces": int(hair.sum()),
    }


def rule_sneakers(hsv, z_norm, face_vertices):
    """스니커즈: 한 켤레(두 덩어리) 전부가 의상이다. 지울 면이 없고 덩어리 두 개를 모두 남긴다."""
    return np.zeros(len(hsv), dtype=bool), {"rule": "keep both shoes"}


RULES = {"tee": rule_tee, "jeans": rule_jeans, "hair": rule_hair, "sneakers": rule_sneakers}
KEEP_COMPONENTS = {"sneakers": 2}
# 가는 틈이 남는 프리셋만 작은 구멍(경계 고리의 대각선 0.35 이하)을 메운다. 얼굴·밑단 같은 큰 개구부는 그대로 둔다.
FILL_HOLES = {"hair"}


def main():
    args = cli_args()
    if len(args) < 2 or flag_value(args, "--preset") not in RULES:
        raise SystemExit("사용법: -- <원본.glb> <출력.glb> --preset tee|jeans|hair|sneakers [--report 보고서.json]")
    source, destination = args[0], args[1]
    preset = flag_value(args, "--preset")

    reset_scene()
    import_glb(source)
    meshes = mesh_objects()
    if len(meshes) != 1:
        raise SystemExit(f"Rodin 원본은 메시 1개여야 한다: {[m.name for m in meshes]}")
    obj = meshes[0]
    before_faces = len(obj.data.polygons)

    rgb = image_rgb(base_color_image(obj))
    face_rgb, z_norm, _ = face_table(obj, rgb)
    hsv = rgb_to_hsv(face_rgb)
    delete_mask, detail = RULES[preset](hsv, z_norm, canonical_triangles(obj))
    kept, removed, dropped_components = delete_faces_and_keep_largest_island(obj, np.asarray(delete_mask), KEEP_COMPONENTS.get(preset, 1))

    filled_holes, filled_faces = (fill_small_holes(obj) if preset in FILL_HOLES else (0, 0))

    low, high = world_bounds([obj])
    export_glb(destination)
    report = {
        "preset": preset,
        "source": os.path.basename(source),
        "facesBefore": before_faces,
        "facesAfter": kept,
        "facesRemoved": removed,
        "droppedComponents": dropped_components,
        "filledHoles": filled_holes,
        "filledFaces": filled_faces,
        "ruleDetail": detail,
        "boundsMin": [round(v, 4) for v in low],
        "boundsMax": [round(v, 4) for v in high],
    }
    report_path = flag_value(args, "--report")
    if report_path:
        write_report(report_path, report)
    print("CLEAN_REPORT", report)


main()
