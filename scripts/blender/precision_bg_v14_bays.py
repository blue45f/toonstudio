"""ToonStudio Precision Architectural Background Kit V14 — 6종 정밀 웹툰 배경 베이 빌더.

모든 빌더는 실세계 미터 규격(1.0 unit = 1m), Z=0 바닥 접지, 100% 닫힌 2-매니폴드(비매니폴드·자유경계·고립정점·0면적 0건),
다단 마이크로 베벨 + 가중 법선(Weighted Normal), 비공면(Non-coplanar >= 8mm 단차) 조립,
이진 금속도(Metallic 0.0 유전체 / 1.0 순수 금속) 물리 기반 Principled BSDF 4슬롯 배칭을 준수한다.
"""

from __future__ import annotations

import math

import bmesh
import bpy

from modeler_kit_v13_primitives import (
    add_beveled_box,
    add_fluted_column_shaft,
    add_lathe_solid,
    add_quad_sphere,
    add_tube_segment,
    create_mesh_object,
)

V14_MAT_CACHE: dict[str, bpy.types.Material] = {}


def clear_v14_material_cache() -> None:
    V14_MAT_CACHE.clear()


def make_physical_mat(
    name: str,
    color: tuple[float, float, float],
    *,
    roughness: float = 0.48,
    metallic: float = 0.0,
    emission_color: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    """이진 금속도(0.0 유전체 / 1.0 순수 금속)와 표준 glTF 2.0 호환성을 보장하는 Principled BSDF 생성기."""
    if metallic not in (0.0, 1.0):
        raise ValueError(f"Non-binary metallic={metallic} in {name}; must be 0.0 (dielectric) or 1.0 (metal).")
    if name in V14_MAT_CACHE:
        return V14_MAT_CACHE[name]

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    mat.diffuse_color = (*color, 1.0)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission_color is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = min(1.0, max(0.0, emission_strength))
    V14_MAT_CACHE[name] = mat
    return mat


def build_modern_corner_bakery_cafe_bay(scene: bpy.types.Scene) -> None:
    """1. 모던 코너 베이커리·카페 통창 파사드 베이 (3.84m × 3.20m × 3.30m)."""
    mat_stone = make_physical_mat("CafeLimestoneFacade", (0.87, 0.84, 0.79), roughness=0.68, metallic=0.0)
    mat_bronze = make_physical_mat("AnodizedBronzeMullion", (0.19, 0.17, 0.16), roughness=0.28, metallic=1.0)
    mat_oak = make_physical_mat("SatinOakAndAwning", (0.61, 0.40, 0.24), roughness=0.34, metallic=0.0)
    mat_glass = make_physical_mat(
        "CafeGlazingWarmGlow",
        (0.84, 0.90, 0.96),
        roughness=0.10,
        metallic=0.0,
        emission_color=(1.0, 0.87, 0.64),
        emission_strength=0.55,
    )

    # 1) 보도블록 슬래브 + 경계석 + 비공면 단차 코너 필라·인방보·코니스·웨인스코팅
    bm_stone = bmesh.new()
    add_beveled_box(bm_stone, (3.80, 3.20, 0.10), (0.0, 0.0, 0.05), 0.010, segments=2)
    for ix in range(4):
        px = -1.38 + ix * 0.92
        add_beveled_box(bm_stone, (0.88, 0.90, 0.024), (px, -1.06, 0.118), 0.005, segments=2)
    add_beveled_box(bm_stone, (3.74, 0.16, 0.052), (0.0, -1.50, 0.132), 0.008, segments=2)

    # 3기의 수직 필라 (바닥보다 6mm 위에서 시작하거나 깊이 인터페네트레이션하되 외벽면 단차 확보)
    for px, py in ((-1.74, -0.44), (1.74, -0.44), (-1.74, 1.38)):
        add_beveled_box(bm_stone, (0.30, 0.30, 3.04), (px, py, 1.60), 0.012, segments=2)
    # 뒷벽은 필라보다 얇게(0.22m, Y=1.39) 안쪽으로 물려 공면 제거
    add_beveled_box(bm_stone, (3.24, 0.22, 2.98), (0.04, 1.39, 1.57), 0.010, segments=2)
    # 좌측 오픈 코너 상부 인방보 + 전면 상부 인방보 + 돌출 코니스 두겁석
    add_beveled_box(bm_stone, (0.22, 1.56, 0.34), (-1.74, 0.47, 2.93), 0.010, segments=2)
    add_beveled_box(bm_stone, (3.22, 0.24, 0.34), (0.0, -0.44, 2.93), 0.010, segments=2)
    add_beveled_box(bm_stone, (3.92, 0.40, 0.13), (0.0, -0.44, 3.205), 0.012, segments=2)
    add_beveled_box(bm_stone, (2.22, 0.20, 0.60), (-0.49, -0.44, 0.39), 0.010, segments=2)
    create_mesh_object(scene, "CafeStoneShell", bm_stone, mat_stone, smooth=True, weighted_normals=True)

    # 2) 다크 브론즈 통창 멀리언·출입문 프레임·어닝 암·테이블 주철 스탠드·에스프레소 머신
    bm_bronze = bmesh.new()
    for mx in (-1.54, -0.82, -0.10, 0.62, 1.54):
        h = 2.66 if mx > 0.58 else 2.06
        cz = 1.43 if mx > 0.58 else 1.73
        add_beveled_box(bm_bronze, (0.052, 0.096, h), (mx, -0.44, cz), 0.005, segments=2)
    for hz in (0.72, 2.26, 2.74):
        w = 2.12 if hz < 0.8 else 3.04
        cx = -0.46 if hz < 0.8 else 0.0
        add_beveled_box(bm_bronze, (w, 0.088, 0.048), (cx, -0.44, hz), 0.004, segments=2)
    add_beveled_box(bm_bronze, (0.82, 0.072, 2.08), (1.08, -0.41, 1.16), 0.005, segments=2)
    add_tube_segment(bm_bronze, (0.78, -0.48, 0.92), (0.78, -0.48, 1.34), 0.014, 0.014, segments=12)
    for ax in (-1.40, -0.46, 0.48):
        add_tube_segment(bm_bronze, (ax, -0.56, 2.66), (ax, -1.24, 2.32), 0.018, 0.015, segments=10)
    add_lathe_solid(
        bm_bronze,
        [(0.22, 0.14), (0.19, 0.17), (0.042, 0.21), (0.038, 0.82)],
        segments=20,
        center_xyz=(-0.92, -1.04, 0.0),
    )
    add_beveled_box(bm_bronze, (0.56, 0.40, 0.42), (-0.68, 0.56, 1.25), 0.012, segments=2)
    for px in (-0.78, -0.06):
        add_tube_segment(bm_bronze, (px, 0.48, 2.94), (px, 0.48, 2.14), 0.008, 0.008, segments=10)
    create_mesh_object(scene, "CafeBronzeFrames", bm_bronze, mat_bronze, smooth=True, weighted_normals=True)

    # 3) 새틴 오크 템바보드 카운터·진열 선반·비스트로 테이블/체어·플리츠 어닝
    bm_oak = bmesh.new()
    add_beveled_box(bm_oak, (2.12, 0.64, 0.90), (-0.38, 0.58, 0.56), 0.010, segments=2)
    add_beveled_box(bm_oak, (2.22, 0.72, 0.052), (-0.38, 0.58, 1.045), 0.008, segments=2)
    for s_idx in range(13):
        sx = -1.34 + s_idx * 0.16
        add_beveled_box(bm_oak, (0.066, 0.028, 0.82), (sx, 0.242, 0.55), 0.006, segments=2)
    for sz in (1.62, 2.12):
        add_beveled_box(bm_oak, (2.34, 0.26, 0.044), (-0.28, 1.13, sz), 0.006, segments=2)
    add_lathe_solid(
        bm_oak,
        [(0.36, 0.825), (0.37, 0.858), (0.35, 0.868)],
        segments=28,
        center_xyz=(-0.92, -1.04, 0.0),
    )
    for side in (-1.42, -0.42):
        add_beveled_box(bm_oak, (0.40, 0.40, 0.034), (side, -1.04, 0.56), 0.006, segments=2)
        add_beveled_box(bm_oak, (0.38, 0.032, 0.36), (side, -1.21, 0.78), 0.006, segments=2, rot_euler=(-0.12, 0.0, 0.0))
        for lx in (-0.15, 0.15):
            for ly in (-0.15, 0.15):
                add_tube_segment(bm_oak, (side + lx, -1.04 + ly, 0.145), (side + lx, -1.04 + ly, 0.545), 0.016, 0.014, segments=8)
    for k in range(7):
        ax = -1.38 + k * 0.315
        add_beveled_box(bm_oak, (0.298, 0.86, 0.046), (ax, -0.94, 2.50), 0.008, segments=2, rot_euler=(0.42, 0.0, 0.0))
    create_mesh_object(scene, "CafeOakJoinery", bm_oak, mat_oak, smooth=True, weighted_normals=True)

    # 4) 비공면 통유리창 + 베이커리 쇼케이스 글래스 + 펜던트 글로브 조명
    bm_glass = bmesh.new()
    add_beveled_box(bm_glass, (2.06, 0.016, 1.46), (-0.46, -0.412, 1.49), 0.003, segments=1)
    add_beveled_box(bm_glass, (2.98, 0.016, 0.40), (0.0, -0.412, 2.50), 0.003, segments=1)
    add_beveled_box(bm_glass, (0.70, 0.014, 1.88), (1.08, -0.388, 1.16), 0.003, segments=1)
    add_beveled_box(bm_glass, (0.82, 0.42, 0.36), (0.22, 0.48, 1.26), 0.008, segments=2)
    for px in (-0.78, -0.06):
        add_quad_sphere(bm_glass, radius=0.105, divisions=5, center_xyz=(px, 0.48, 2.03))
    create_mesh_object(scene, "CafeGlazingAndLamps", bm_glass, mat_glass, smooth=True, weighted_normals=True)


def build_korean_highschool_window_corridor_bay(scene: bpy.types.Scene) -> None:
    """2. 한국 고등학교 교실·복도 창측 정밀 베이 (3.60m × 3.20m × 3.06m)."""
    mat_wall = make_physical_mat("ClassroomCreamPlaster", (0.91, 0.89, 0.85), roughness=0.78, metallic=0.0)
    mat_wood = make_physical_mat("ClassroomVarnishedOak", (0.64, 0.45, 0.27), roughness=0.35, metallic=0.0)
    mat_metal = make_physical_mat("ClassroomAluminumSteel", (0.76, 0.79, 0.82), roughness=0.26, metallic=1.0)
    mat_glass = make_physical_mat(
        "ClassroomDaylightPane",
        (0.82, 0.91, 0.98),
        roughness=0.09,
        metallic=0.0,
        emission_color=(0.78, 0.90, 1.0),
        emission_strength=0.48,
    )

    # 1) 구조 슬래브 + 뒷벽 대형 채광창 벽체(Y=+1.46) + 좌측 복도 내벽·미닫이문 파티션(X=-1.46) -> 전면·우측 완전 오픈 컷어웨이!
    bm_wall = bmesh.new()
    add_beveled_box(bm_wall, (3.60, 3.20, 0.09), (0.0, 0.0, 0.045), 0.008, segments=2)
    for px, py in ((-1.46, 1.46), (1.64, 1.46), (-1.46, -1.46)):
        add_beveled_box(bm_wall, (0.28, 0.28, 2.94), (px, py, 1.56), 0.010, segments=2)
    # 후면 외창 허리벽(900mm) + 창턱 두겁 + 상단 인방보 (필라 사이로 단차 배치)
    add_beveled_box(bm_wall, (2.86, 0.20, 0.82), (0.09, 1.46, 0.50), 0.008, segments=2)
    add_beveled_box(bm_wall, (2.84, 0.26, 0.048), (0.09, 1.44, 0.942), 0.006, segments=2)
    add_beveled_box(bm_wall, (2.86, 0.20, 0.58), (0.09, 1.46, 2.74), 0.008, segments=2)
    # 좌측 복도 파티션 벽 (앞쪽 미닫이문 개구부 + 뒤쪽 고창 허리벽 + 상부 인방보)
    add_beveled_box(bm_wall, (0.18, 1.46, 0.92), (-1.46, 0.60, 0.55), 0.008, segments=2)
    add_beveled_box(bm_wall, (0.22, 0.20, 2.92), (-1.46, -0.18, 1.55), 0.008, segments=2)
    add_beveled_box(bm_wall, (0.18, 2.68, 0.52), (-1.46, 0.0, 2.77), 0.008, segments=2)
    create_mesh_object(scene, "SchoolPlasterStructure", bm_wall, mat_wall, smooth=True, weighted_normals=True)

    # 2) 교실 오크 마루 플랭크 9열 + 허리 몰딩 + 복도 미닫이문 + 학생 책걸상 2조(정면이 우측 칠판 +X를 향함)
    bm_wood = bmesh.new()
    for p_idx in range(9):
        py = -1.24 + p_idx * 0.31
        add_beveled_box(bm_wood, (2.92, 0.296, 0.022), (0.28, py, 0.104), 0.004, segments=2)
    add_beveled_box(bm_wood, (0.030, 1.42, 0.072), (-1.352, 0.60, 1.02), 0.005, segments=2)
    add_beveled_box(bm_wood, (0.048, 1.08, 2.08), (-1.345, -0.82, 1.15), 0.006, segments=2)

    for desk_x, desk_y in ((-0.26, 0.52), (0.94, 0.52), (-0.26, -0.56), (0.94, -0.56)):
        add_beveled_box(bm_wood, (0.50, 0.68, 0.028), (desk_x, desk_y, 0.84), 0.005, segments=2)
        add_beveled_box(bm_wood, (0.022, 0.58, 0.22), (desk_x + 0.21, desk_y, 0.69), 0.004, segments=2)
        add_beveled_box(bm_wood, (0.40, 0.42, 0.024), (desk_x - 0.50, desk_y, 0.55), 0.005, segments=2)
        add_beveled_box(bm_wood, (0.024, 0.40, 0.24), (desk_x - 0.68, desk_y, 0.78), 0.005, segments=2, rot_euler=(0.0, -0.10, 0.0))
    create_mesh_object(scene, "SchoolWoodFloorAndDesks", bm_wood, mat_wood, smooth=True, weighted_normals=True)

    # 3) 이중 알루미늄 미닫이 창틀 + 복도 고창 프레임 + 방열 라디에이터 핀 + 스틸 책걸상 다리
    bm_metal = bmesh.new()
    for sash_x, track_y in ((-0.58, 1.442), (0.76, 1.478)):
        add_beveled_box(bm_metal, (1.42, 0.038, 0.046), (sash_x, track_y, 0.992), 0.004, segments=2)
        add_beveled_box(bm_metal, (1.42, 0.038, 0.046), (sash_x, track_y, 2.415), 0.004, segments=2)
        for sx in (-0.69, 0.0, 0.69):
            add_beveled_box(bm_metal, (0.042, 0.038, 1.38), (sash_x + sx, track_y, 1.70), 0.004, segments=2)
    for hz in (1.04, 1.88, 2.48):
        add_beveled_box(bm_metal, (0.048, 1.42, 0.040), (-1.46, 0.60, hz), 0.004, segments=2)
    for vy in (-0.06, 0.60, 1.28):
        add_beveled_box(bm_metal, (0.048, 0.040, 1.40), (-1.46, vy, 1.76), 0.004, segments=2)
    for f_idx in range(12):
        fx = -0.78 + f_idx * 0.16
        add_beveled_box(bm_metal, (0.024, 0.11, 0.50), (fx, 1.28, 0.48), 0.003, segments=1)
    add_tube_segment(bm_metal, (-0.88, 1.28, 0.68), (1.08, 1.28, 0.68), 0.018, 0.018, segments=10)
    for desk_x, desk_y in ((-0.26, 0.52), (0.94, 0.52), (-0.26, -0.56), (0.94, -0.56)):
        for ly in (-0.28, 0.28):
            add_tube_segment(bm_metal, (desk_x - 0.18, desk_y + ly, 0.118), (desk_x - 0.18, desk_y + ly, 0.822), 0.015, 0.015, segments=8)
            add_tube_segment(bm_metal, (desk_x + 0.18, desk_y + ly, 0.118), (desk_x + 0.18, desk_y + ly, 0.822), 0.015, 0.015, segments=8)
        for cy in (-0.17, 0.17):
            add_tube_segment(bm_metal, (desk_x - 0.36, desk_y + cy, 0.118), (desk_x - 0.36, desk_y + cy, 0.535), 0.013, 0.013, segments=8)
            add_tube_segment(bm_metal, (desk_x - 0.65, desk_y + cy, 0.118), (desk_x - 0.68, desk_y + cy, 0.775), 0.013, 0.013, segments=8)
    create_mesh_object(scene, "SchoolAluminumFrames", bm_metal, mat_metal, smooth=True, weighted_normals=True)

    # 4) 비공면 외창·복도 내창·교실문 시창 유리 + 천장 LED 등기구
    bm_glass = bmesh.new()
    add_beveled_box(bm_glass, (1.32, 0.012, 1.32), (-0.58, 1.422, 1.70), 0.002, segments=1)
    add_beveled_box(bm_glass, (1.32, 0.012, 1.32), (0.76, 1.496, 1.70), 0.002, segments=1)
    add_beveled_box(bm_glass, (0.012, 1.34, 1.36), (-1.440, 0.60, 1.76), 0.002, segments=1)
    add_beveled_box(bm_glass, (0.014, 0.26, 0.74), (-1.312, -0.82, 1.54), 0.002, segments=1)
    for ly in (-0.42, 0.56):
        add_beveled_box(bm_glass, (1.28, 0.24, 0.042), (0.34, ly, 2.94), 0.006, segments=2)
    create_mesh_object(scene, "SchoolDaylightGlazing", bm_glass, mat_glass, smooth=True, weighted_normals=True)


def build_rofan_grand_vault_colonnade_bay(scene: bpy.types.Scene) -> None:
    """3. 로판 황궁 리브 볼트·코린트 열주 회랑 베이 (3.80m × 3.00m × 4.15m)."""
    mat_marble = make_physical_mat("ImperialCreamMarble", (0.91, 0.88, 0.82), roughness=0.34, metallic=0.0)
    mat_slate = make_physical_mat("RoyalPorphyryInlay", (0.28, 0.32, 0.40), roughness=0.40, metallic=0.0)
    mat_brass = make_physical_mat("PalaceGildedBrass", (0.83, 0.66, 0.31), roughness=0.22, metallic=1.0)
    mat_glow = make_physical_mat(
        "PalaceSconceGlow",
        (1.0, 0.92, 0.72),
        roughness=0.14,
        metallic=0.0,
        emission_color=(1.0, 0.86, 0.50),
        emission_strength=0.95,
    )

    bm_marble = bmesh.new()
    add_beveled_box(bm_marble, (3.80, 3.00, 0.14), (0.0, 0.0, 0.07), 0.012, segments=2)
    add_beveled_box(bm_marble, (3.54, 2.74, 0.12), (0.0, 0.0, 0.205), 0.010, segments=2)

    col_coords = ((-1.42, -1.04), (1.42, -1.04), (-1.42, 1.04), (1.42, 1.04))
    for cx, cy in col_coords:
        add_beveled_box(bm_marble, (0.52, 0.52, 0.22), (cx, cy, 0.38), 0.010, segments=2)
        add_lathe_solid(
            bm_marble,
            [(0.24, 0.495), (0.21, 0.55), (0.23, 0.60), (0.185, 0.66)],
            segments=24,
            center_xyz=(cx, cy, 0.0),
        )
        add_fluted_column_shaft(
            bm_marble,
            base_radius=0.175,
            top_radius=0.152,
            height=2.10,
            flutes=16,
            flute_depth=0.010,
            entasis=0.010,
            z_divisions=10,
            center_xyz=(cx, cy, 0.66),
        )
        add_lathe_solid(
            bm_marble,
            [(0.16, 2.77), (0.21, 2.86), (0.26, 2.98), (0.28, 3.04)],
            segments=24,
            center_xyz=(cx, cy, 0.0),
        )
        add_beveled_box(bm_marble, (0.58, 0.58, 0.12), (cx, cy, 3.105), 0.010, segments=2)

    # 좌우 아키트레이브 엔타블러처 보 + 전후 부수아르 아치 + 대각선 크로스 볼트 리브
    for sx in (-1.42, 1.42):
        add_beveled_box(bm_marble, (0.34, 1.62, 0.22), (sx, 0.0, 3.24), 0.010, segments=2)
    for ay in (-1.04, 1.04):
        for i in range(11):
            ang = math.pi * (i + 0.5) / 11.0
            vx = math.cos(ang) * 1.42
            vz = 3.18 + math.sin(ang) * 0.82
            is_key = i == 5
            add_beveled_box(
                bm_marble,
                (0.28 if is_key else 0.24, 0.36 if is_key else 0.30, 0.30 if is_key else 0.24),
                (vx, ay, vz),
                0.010,
                segments=2,
                rot_euler=(0.0, math.pi * 0.5 - ang, 0.0),
            )
    for diag in ((-1, -1, 1, 1), (-1, 1, 1, -1)):
        prev_pt = (diag[0] * 1.42, diag[1] * 1.04, 3.18)
        for step in range(1, 9):
            t = step / 8.0
            nx = (diag[0] * (1.0 - t) + diag[2] * t) * 1.42
            ny = (diag[1] * (1.0 - t) + diag[3] * t) * 1.04
            nz = 3.18 + math.sin(math.pi * t) * 0.88
            add_tube_segment(bm_marble, prev_pt, (nx, ny, nz), 0.056, 0.056, segments=10)
            prev_pt = (nx, ny, nz)

    add_beveled_box(bm_marble, (2.28, 0.22, 0.09), (0.0, -1.04, 0.315), 0.008, segments=2)
    add_beveled_box(bm_marble, (2.32, 0.26, 0.095), (0.0, -1.04, 1.22), 0.010, segments=2)
    for b_idx in range(7):
        bx = -0.96 + b_idx * 0.32
        add_lathe_solid(
            bm_marble,
            [(0.058, 0.365), (0.042, 0.49), (0.072, 0.69), (0.038, 0.97), (0.056, 1.17)],
            segments=16,
            center_xyz=(bx, -1.04, 0.0),
        )
    create_mesh_object(scene, "PalaceMarbleColonnade", bm_marble, mat_marble, smooth=True, weighted_normals=True)

    bm_slate = bmesh.new()
    for ix in (-0.88, 0.0, 0.88):
        for iy in (-0.42, 0.42):
            add_beveled_box(bm_slate, (0.74, 0.68, 0.022), (ix, iy, 0.278), 0.005, segments=2)
    create_mesh_object(scene, "PalaceFloorInlay", bm_slate, mat_slate, smooth=True, weighted_normals=True)

    bm_brass = bmesh.new()
    for cx, cy in col_coords:
        add_lathe_solid(
            bm_brass,
            [(0.168, 2.74), (0.186, 2.765), (0.168, 2.79)],
            segments=24,
            center_xyz=(cx, cy, 0.0),
        )
    for sx in (-1.42, 1.42):
        add_beveled_box(bm_brass, (0.08, 0.04, 0.26), (sx, -0.76, 1.98), 0.005, segments=2)
        add_tube_segment(bm_brass, (sx, -0.78, 1.96), (sx, -0.60, 2.08), 0.014, 0.012, segments=10)
        add_lathe_solid(
            bm_brass,
            [(0.022, 2.06), (0.058, 2.11), (0.048, 2.13)],
            segments=16,
            center_xyz=(sx, -0.60, 0.0),
        )
    add_lathe_solid(
        bm_brass,
        [(0.22, 3.98), (0.26, 4.04), (0.18, 4.10)],
        segments=24,
    )
    add_tube_segment(bm_brass, (0.0, 0.0, 3.98), (0.0, 0.0, 3.38), 0.015, 0.015, segments=12)
    add_lathe_solid(
        bm_brass,
        [(0.04, 3.26), (0.28, 3.34), (0.26, 3.39), (0.06, 3.44)],
        segments=24,
    )
    create_mesh_object(scene, "PalaceBrassFixtures", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    bm_glow = bmesh.new()
    for sx in (-1.42, 1.42):
        add_quad_sphere(bm_glow, radius=0.052, divisions=4, center_xyz=(sx, -0.60, 2.18), scale_xyz=(0.85, 0.85, 1.35))
    add_quad_sphere(bm_glow, radius=0.135, divisions=5, center_xyz=(0.0, 0.0, 3.22))
    create_mesh_object(scene, "PalaceSconceFlames", bm_glow, mat_glow, smooth=True, weighted_normals=True)


def build_modern_officetel_studio_loft_bay(scene: bpy.types.Scene) -> None:
    """4. 현대 오피스텔·원룸 복층 창가 코너 베이 (3.40m × 3.20m × 2.86m)."""
    mat_wall = make_physical_mat("StudioWarmAlabaster", (0.93, 0.91, 0.88), roughness=0.80, metallic=0.0)
    mat_walnut = make_physical_mat("NaturalWalnutJoinery", (0.50, 0.34, 0.21), roughness=0.35, metallic=0.0)
    mat_steel = make_physical_mat("AnodizedMatteBlackSteel", (0.17, 0.18, 0.20), roughness=0.28, metallic=1.0)
    mat_light = make_physical_mat(
        "LoftCoveAndCityWindow",
        (0.78, 0.86, 0.96),
        roughness=0.11,
        metallic=0.0,
        emission_color=(0.98, 0.90, 0.76),
        emission_strength=0.58,
    )

    # 1) 바닥 슬래브 + 좌측 벽(X=-1.59) + 후면 파노라마 통창 벽(Y=+1.49) + 비공면 우물천장 코브 + 부클레 2인 소파
    bm_wall = bmesh.new()
    add_beveled_box(bm_wall, (3.40, 3.20, 0.09), (0.0, 0.0, 0.045), 0.008, segments=2)
    add_beveled_box(bm_wall, (0.20, 3.16, 2.72), (-1.59, 0.0, 1.455), 0.010, segments=2)
    add_beveled_box(bm_wall, (2.90, 0.20, 0.42), (-0.01, 1.48, 0.305), 0.008, segments=2)
    add_beveled_box(bm_wall, (2.90, 0.26, 0.30), (-0.01, 1.45, 2.66), 0.010, segments=2)
    add_beveled_box(bm_wall, (0.26, 0.26, 2.74), (1.56, 1.47, 1.465), 0.010, segments=2)
    # 천장 간접조명 코브 (벽 외곽선보다 14mm 안쪽/위로 분리해 공면·비매니폴드 완전 제거)
    add_beveled_box(bm_wall, (2.86, 0.38, 0.11), (-0.01, 1.24, 2.795), 0.008, segments=2)
    add_beveled_box(bm_wall, (0.38, 2.52, 0.11), (-1.34, -0.18, 2.780), 0.008, segments=2)
    # 2인 라운지 소파 (시트·등받이·팔걸이 간 12mm 단차로 공면 그림자 결함 제거)
    add_beveled_box(bm_wall, (1.44, 0.72, 0.26), (0.56, -0.44, 0.37), 0.026, segments=2)
    add_beveled_box(bm_wall, (1.40, 0.22, 0.46), (0.56, -0.74, 0.67), 0.024, segments=2)
    for arm_x in (-0.20, 1.32):
        add_beveled_box(bm_wall, (0.16, 0.80, 0.42), (arm_x, -0.46, 0.51), 0.022, segments=2)
    create_mesh_object(scene, "StudioWallsAndSofa", bm_wall, mat_wall, smooth=True, weighted_normals=True)

    # 2) 광폭 원목 마루 플랭크 + 빌트인 4단 책장·데스크 일체형 가구(모니터 니치 확보) + 원형 로우 테이블
    bm_walnut = bmesh.new()
    for p_idx in range(8):
        px = -1.24 + p_idx * 0.39
        add_beveled_box(bm_walnut, (0.376, 2.90, 0.022), (px, -0.06, 0.104), 0.004, segments=2)
    for sy in (-1.24, 0.58):
        add_beveled_box(bm_walnut, (0.34, 0.036, 2.34), (-1.30, sy, 1.29), 0.005, segments=2)
    add_beveled_box(bm_walnut, (0.32, 0.034, 0.96), (-1.30, -0.32, 1.88), 0.005, segments=2)
    for sz in (0.46, 0.85, 1.38, 1.86, 2.34):
        if abs(sz - 0.46) < 0.02:
            add_beveled_box(bm_walnut, (0.33, 0.52, 0.034), (-1.30, -0.94, sz), 0.005, segments=2)
        else:
            depth = 0.62 if abs(sz - 0.85) < 0.02 else 0.33
            cx = -1.16 if abs(sz - 0.85) < 0.02 else -1.30
            add_beveled_box(bm_walnut, (depth, 1.80, 0.036), (cx, -0.33, sz), 0.005, segments=2)
    add_lathe_solid(
        bm_walnut,
        [(0.38, 0.43), (0.40, 0.458), (0.38, 0.472)],
        segments=28,
        center_xyz=(0.56, 0.34, 0.0),
    )
    create_mesh_object(scene, "StudioWalnutJoinery", bm_walnut, mat_walnut, smooth=True, weighted_normals=True)

    # 3) 파노라마 블랙 멀리언 + 블라인드 슬랫 + 울트라와이드 모니터 암 + 가구 스틸 레그
    bm_steel = bmesh.new()
    for mx in (-1.34, -0.40, 0.54, 1.40):
        add_beveled_box(bm_steel, (0.048, 0.080, 1.98), (mx, 1.47, 1.50), 0.004, segments=2)
    for hz in (0.54, 1.32, 2.48):
        add_beveled_box(bm_steel, (2.80, 0.078, 0.044), (0.03, 1.47, hz), 0.004, segments=2)
    for b_idx in range(6):
        bz = 2.06 + b_idx * 0.068
        add_beveled_box(bm_steel, (2.70, 0.042, 0.010), (0.03, 1.37, bz), 0.002, segments=1, rot_euler=(0.30, 0.0, 0.0))
    add_tube_segment(bm_steel, (-1.34, -0.32, 0.875), (-1.30, -0.32, 1.18), 0.018, 0.016, segments=10)
    add_beveled_box(bm_steel, (0.032, 0.74, 0.36), (-1.24, -0.32, 1.20), 0.005, segments=2)
    for sx in (-0.18, 1.30):
        for sy in (-0.76, -0.14):
            add_tube_segment(bm_steel, (sx, sy, 0.118), (sx, sy, 0.295), 0.016, 0.014, segments=8)
    for ang_i in range(3):
        ang = (2.0 * math.pi * ang_i) / 3.0
        add_tube_segment(
            bm_steel,
            (0.56 + 0.26 * math.cos(ang), 0.34 + 0.26 * math.sin(ang), 0.118),
            (0.56 + 0.18 * math.cos(ang), 0.34 + 0.18 * math.sin(ang), 0.432),
            0.015,
            0.013,
            segments=8,
        )
    create_mesh_object(scene, "StudioBlackSteel", bm_steel, mat_steel, smooth=True, weighted_normals=True)

    # 4) 비공면 파노라마 유리창 + 우물천장 간접 LED 바 + 모니터 디스플레이 발광면
    bm_light = bmesh.new()
    add_beveled_box(bm_light, (2.72, 0.014, 1.88), (0.03, 1.498, 1.50), 0.002, segments=1)
    add_beveled_box(bm_light, (2.74, 0.032, 0.022), (0.16, 1.03, 2.755), 0.003, segments=1)
    add_beveled_box(bm_light, (0.012, 0.70, 0.32), (-1.218, -0.32, 1.20), 0.002, segments=1)
    create_mesh_object(scene, "StudioGlazingAndCoveLed", bm_light, mat_light, smooth=True, weighted_normals=True)


def build_subway_platform_screen_door_bay(scene: bpy.types.Scene) -> None:
    """5. 도시 지하철 승강장 스크린도어·안전선 정밀 베이 (4.00m × 2.80m × 3.04m)."""
    mat_granite = make_physical_mat("SubwayHonedGranite", (0.69, 0.71, 0.74), roughness=0.56, metallic=0.0)
    mat_stainless = make_physical_mat("SubwayBrushedStainless", (0.78, 0.80, 0.84), roughness=0.26, metallic=1.0)
    mat_tactile = make_physical_mat("SubwaySafetyTactileYellow", (0.93, 0.73, 0.12), roughness=0.50, metallic=0.0)
    mat_sign = make_physical_mat(
        "SubwayPsdGlassAndSign",
        (0.84, 0.92, 0.98),
        roughness=0.10,
        metallic=0.0,
        emission_color=(0.82, 0.93, 1.0),
        emission_strength=0.68,
    )

    bm_granite = bmesh.new()
    add_beveled_box(bm_granite, (4.00, 2.80, 0.12), (0.0, 0.0, 0.06), 0.010, segments=2)
    for gx in range(5):
        for gy in range(3):
            add_beveled_box(
                bm_granite,
                (0.76, 0.78, 0.020),
                (-1.56 + gx * 0.78, -0.92 + gy * 0.82, 0.132),
                0.004,
                segments=2,
            )
    add_lathe_solid(
        bm_granite,
        [(0.32, 0.145), (0.29, 0.28)],
        segments=8,
        center_xyz=(-1.46, -0.22, 0.0),
    )
    add_beveled_box(bm_granite, (4.00, 1.26, 0.14), (0.0, 0.77, 2.94), 0.010, segments=2)
    create_mesh_object(scene, "SubwayGranitePlatform", bm_granite, mat_granite, smooth=True, weighted_normals=True)

    bm_stainless = bmesh.new()
    for px in (-1.90, -0.92, 0.0, 0.92, 1.90):
        w = 0.14 if abs(px) > 1.8 else 0.075
        add_beveled_box(bm_stainless, (w, 0.16, 2.46), (px, 1.18, 1.37), 0.006, segments=2)
    add_beveled_box(bm_stainless, (3.92, 0.18, 0.34), (0.0, 1.18, 2.72), 0.008, segments=2)
    for door_x in (-1.41, -0.46, 0.46, 1.41):
        add_beveled_box(bm_stainless, (0.84, 0.08, 0.16), (door_x, 1.16, 0.22), 0.005, segments=2)
        add_beveled_box(bm_stainless, (0.84, 0.08, 0.10), (door_x, 1.16, 2.22), 0.005, segments=2)
    add_lathe_solid(
        bm_stainless,
        [(0.26, 0.285), (0.25, 2.86)],
        segments=8,
        center_xyz=(-1.46, -0.22, 0.0),
    )
    for sx in (0.34, 1.14):
        add_tube_segment(bm_stainless, (sx, -0.18, 2.86), (sx, -0.18, 2.46), 0.018, 0.018, segments=10)
    add_beveled_box(bm_stainless, (0.98, 0.14, 0.30), (0.74, -0.18, 2.34), 0.008, segments=2)
    # 3인 인체공학 승강장 벤치 (전면 시야에서도 좌석 실루엣이 읽히도록 양방향 백리스/로우백 구성)
    add_beveled_box(bm_stainless, (1.58, 0.08, 0.06), (0.68, -0.68, 0.46), 0.006, segments=2)
    for bx in (0.10, 1.26):
        add_tube_segment(bm_stainless, (bx, -0.68, 0.145), (bx, -0.68, 0.46), 0.032, 0.028, segments=12)
    for seat_i in range(3):
        sx = 0.16 + seat_i * 0.52
        add_beveled_box(bm_stainless, (0.46, 0.44, 0.036), (sx, -0.68, 0.51), 0.008, segments=2)
        add_beveled_box(bm_stainless, (0.44, 0.034, 0.26), (sx, -0.47, 0.65), 0.008, segments=2, rot_euler=(0.14, 0.0, 0.0))
    create_mesh_object(scene, "SubwayStainlessPsdAndBench", bm_stainless, mat_stainless, smooth=True, weighted_normals=True)

    bm_tactile = bmesh.new()
    for t_idx in range(12):
        tx = -1.76 + t_idx * 0.32
        add_beveled_box(bm_tactile, (0.30, 0.30, 0.022), (tx, 0.72, 0.155), 0.005, segments=2)
    create_mesh_object(scene, "SubwaySafetyTactileLine", bm_tactile, mat_tactile, smooth=True, weighted_normals=True)

    bm_sign = bmesh.new()
    for door_x in (-1.41, -0.46, 0.46, 1.41):
        add_beveled_box(bm_sign, (0.78, 0.016, 1.84), (door_x, 1.196, 1.22), 0.003, segments=1)
    add_beveled_box(bm_sign, (3.74, 0.020, 0.22), (0.0, 1.076, 2.72), 0.004, segments=1)
    add_beveled_box(bm_sign, (0.90, 0.018, 0.22), (0.74, -0.260, 2.34), 0.003, segments=1)
    create_mesh_object(scene, "SubwayPsdGlassAndLed", bm_sign, mat_sign, smooth=True, weighted_normals=True)


def build_rooftop_sunset_parapet_stairhouse_bay(scene: bpy.types.Scene) -> None:
    """6. 학교·빌딩 옥상 계단실·난간 펜스 베이 (4.06m × 3.46m × 3.16m)."""
    mat_concrete = make_physical_mat("RooftopConcreteDeck", (0.70, 0.72, 0.70), roughness=0.76, metallic=0.0)
    mat_steel = make_physical_mat("RooftopGalvanizedSteel", (0.68, 0.71, 0.75), roughness=0.30, metallic=1.0)
    mat_brick = make_physical_mat("StairhouseTerracottaTrim", (0.59, 0.35, 0.28), roughness=0.66, metallic=0.0)
    mat_beacon = make_physical_mat(
        "RooftopBulkheadWarmLamp",
        (1.0, 0.87, 0.58),
        roughness=0.14,
        metallic=0.0,
        emission_color=(1.0, 0.80, 0.40),
        emission_strength=0.95,
    )

    bm_conc = bmesh.new()
    add_beveled_box(bm_conc, (4.00, 3.40, 0.12), (0.0, 0.0, 0.06), 0.010, segments=2)
    for gx in (-1.0, 1.0):
        for gy in (-0.82, 0.82):
            add_beveled_box(bm_conc, (1.86, 1.52, 0.020), (gx, gy, 0.132), 0.005, segments=2)
    # L자 파라펫 난간벽 (모서리 16mm 단차로 공면·비매니폴드 에지 완전 차단)
    add_beveled_box(bm_conc, (4.00, 0.24, 1.08), (0.0, 1.58, 0.665), 0.010, segments=2)
    add_beveled_box(bm_conc, (4.06, 0.30, 0.08), (0.0, 1.58, 1.25), 0.010, segments=2)
    add_beveled_box(bm_conc, (0.22, 3.12, 1.06), (1.87, -0.10, 0.665), 0.010, segments=2)
    add_beveled_box(bm_conc, (0.28, 3.16, 0.076), (1.87, -0.10, 1.242), 0.010, segments=2)
    # 옥탑 계단실 본체 + 출입 계단 단 + 우측 실외기 기초 패드
    add_beveled_box(bm_conc, (1.84, 1.52, 2.76), (-0.96, 0.64, 1.51), 0.014, segments=2)
    add_beveled_box(bm_conc, (2.02, 1.70, 0.14), (-0.96, 0.64, 2.97), 0.012, segments=2)
    add_beveled_box(bm_conc, (1.10, 0.40, 0.14), (-0.86, -0.32, 0.205), 0.008, segments=2)
    add_beveled_box(bm_conc, (1.08, 0.56, 0.12), (0.92, 0.90, 0.195), 0.008, segments=2)
    create_mesh_object(scene, "RooftopConcreteParapet", bm_conc, mat_concrete, smooth=True, weighted_normals=True)

    bm_steel = bmesh.new()
    add_beveled_box(bm_steel, (0.96, 0.064, 2.06), (-0.86, -0.145, 1.31), 0.006, segments=2)
    add_beveled_box(bm_steel, (0.84, 0.046, 1.96), (-0.86, -0.178, 1.31), 0.005, segments=2)
    add_tube_segment(bm_steel, (-1.18, -0.22, 1.18), (-0.54, -0.22, 1.18), 0.016, 0.016, segments=10)
    for px in (0.14, 0.72, 1.30, 1.87):
        add_tube_segment(bm_steel, (px, 1.58, 1.29), (px, 1.58, 1.82), 0.020, 0.018, segments=10)
    for py in (0.94, 0.24, -0.46, -1.16):
        add_tube_segment(bm_steel, (1.87, py, 1.28), (1.87, py, 1.82), 0.020, 0.018, segments=10)
    for rz in (1.56, 1.80):
        add_tube_segment(bm_steel, (0.12, 1.58, rz), (1.87, 1.58, rz), 0.016, 0.016, segments=10)
        add_tube_segment(bm_steel, (1.87, 1.58, rz), (1.87, -1.20, rz), 0.016, 0.016, segments=10)
    for ly in (0.46, 0.78):
        add_tube_segment(bm_steel, (0.02, ly, 0.26), (0.02, ly, 2.90), 0.016, 0.016, segments=10)
    for rung_i in range(8):
        rz = 0.48 + rung_i * 0.32
        add_tube_segment(bm_steel, (0.02, 0.46, rz), (0.02, 0.78, rz), 0.012, 0.012, segments=8)
    add_beveled_box(bm_steel, (0.94, 0.40, 0.78), (0.92, 0.90, 0.67), 0.010, segments=2)
    for fx in (0.68, 1.16):
        add_lathe_solid(
            bm_steel,
            [(0.18, -0.015), (0.19, 0.022), (0.15, 0.028)],
            segments=20,
            center_xyz=(fx, 0.685, 0.68),
            rot_euler=(math.pi * 0.5, 0.0, 0.0),
        )
    create_mesh_object(scene, "RooftopSteelSafetyAndHvac", bm_steel, mat_steel, smooth=True, weighted_normals=True)

    bm_brick = bmesh.new()
    add_beveled_box(bm_brick, (1.92, 1.60, 0.24), (-0.96, 0.64, 2.66), 0.008, segments=2)
    add_beveled_box(bm_brick, (1.28, 0.48, 0.055), (-0.86, -0.35, 2.42), 0.008, segments=2, rot_euler=(0.16, 0.0, 0.0))
    for rx in (0.56, 1.28):
        for ry in (0.74, 1.06):
            add_beveled_box(bm_brick, (0.08, 0.08, 0.032), (rx, ry, 0.272), 0.004, segments=1)
    create_mesh_object(scene, "RooftopTerracottaCanopy", bm_brick, mat_brick, smooth=True, weighted_normals=True)

    bm_beacon = bmesh.new()
    add_quad_sphere(bm_beacon, radius=0.072, divisions=4, center_xyz=(-0.86, -0.22, 2.58), scale_xyz=(1.25, 0.85, 0.85))
    add_beveled_box(bm_beacon, (0.20, 0.014, 0.46), (-0.86, -0.208, 1.68), 0.002, segments=1)
    add_quad_sphere(bm_beacon, radius=0.055, divisions=4, center_xyz=(-1.78, 1.32, 3.10))
    create_mesh_object(scene, "RooftopBeaconAndVisionPane", bm_beacon, mat_beacon, smooth=True, weighted_normals=True)
