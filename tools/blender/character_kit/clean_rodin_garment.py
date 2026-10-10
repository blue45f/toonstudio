"""Hyper3D(Rodin) 의상 원본 정리 (Blender 헤드리스).

사용:
    blender --background --python clean_rodin_garment.py -- <원본.glb> <출력.glb> --preset tee|jeans [--report 보고서.json]

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
    cli_args,
    delete_faces_and_keep_largest_island,
    export_glb,
    face_table,
    flag_value,
    image_rgb,
    import_glb,
    mesh_objects,
    reset_scene,
    rgb_to_hsv,
    world_bounds,
    write_report,
)


def rule_tee(hsv, z_norm):
    """티셔츠: 셔츠는 무채색(채도 ≈ 0.01)이고 마네킹 목 조각만 갈색(색상 0~70°, 채도 ≥ 0.15)이다."""
    warm = (hsv[:, 0] < 70.0) & (hsv[:, 1] >= 0.15)
    return warm, {"rule": "warm-saturated faces are the mannequin neck stump"}


def rule_jeans(hsv, z_norm):
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


RULES = {"tee": rule_tee, "jeans": rule_jeans}


def main():
    args = cli_args()
    if len(args) < 2 or flag_value(args, "--preset") not in RULES:
        raise SystemExit("사용법: -- <원본.glb> <출력.glb> --preset tee|jeans [--report 보고서.json]")
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
    delete_mask, detail = RULES[preset](hsv, z_norm)
    kept, removed, dropped_components = delete_faces_and_keep_largest_island(obj, np.asarray(delete_mask))

    low, high = world_bounds([obj])
    export_glb(destination)
    report = {
        "preset": preset,
        "source": os.path.basename(source),
        "facesBefore": before_faces,
        "facesAfter": kept,
        "facesRemoved": removed,
        "droppedComponents": dropped_components,
        "ruleDetail": detail,
        "boundsMin": [round(v, 4) for v in low],
        "boundsMax": [round(v, 4) for v in high],
    }
    report_path = flag_value(args, "--report")
    if report_path:
        write_report(report_path, report)
    print("CLEAN_REPORT", report)


main()
