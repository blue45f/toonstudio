"""ToonStudio Modeler Kit V13 — 추가 플래그십 고품질 CC0 에셋 4종 빌더.

포함 에셋:
5. webtoon-ornate-clocktower-gear-core-v13 (오르골·시계탑 정밀 기어 아스트롤라베 코어)
6. webtoon-hanok-paljak-pavilion-bay-v13 (전통 한옥 배흘림기둥·처마 정자 모듈)
7. webtoon-creator-ergonomic-chair-desk-v13 (웹툰 작가 모션데스크·인체공학 체어 세트)
8. webtoon-fantasy-potion-apothecary-cabinet-v13 (판타지 연금술 포션 진열장·약재함)
"""

from __future__ import annotations

import math

import bmesh
import bpy

from modeler_kit_v13_primitives import (
    add_beveled_box,
    add_fluted_column_shaft,
    add_involute_gear,
    add_lathe_solid,
    add_quad_sphere,
    add_tube_segment,
    create_mesh_object,
    make_mat,
)


def build_ornate_clocktower_gear_core(scene: bpy.types.Scene) -> None:
    mat_brass = make_mat("ClockworkPolishedBrass", (0.83, 0.66, 0.31), roughness=0.24, metallic=0.92)
    mat_copper = make_mat("PlanetaryAgedCopper", (0.76, 0.42, 0.28), roughness=0.30, metallic=0.88)
    mat_steel = make_mat("BluedHorologySteel", (0.17, 0.22, 0.31), roughness=0.32, metallic=0.86)
    mat_core = make_mat(
        "AstralChronoCrystal",
        (0.32, 0.76, 0.98),
        roughness=0.14,
        metallic=0.10,
        emission_color=(0.22, 0.66, 0.96),
        emission_strength=1.45,
    )

    # Stepped horological blued-steel plinth + A-frame standards, drive arbors & bearing blocks (4-draw-call mobile-hero budget)
    bm_steel = bmesh.new()
    add_beveled_box(bm_steel, (1.36, 0.74, 0.08), (0.0, 0.0, 0.04), 0.012, segments=2)
    add_beveled_box(bm_steel, (1.20, 0.60, 0.06), (0.0, 0.0, 0.115), 0.010, segments=2)
    for fy in (-0.21, 0.21):
        add_tube_segment(bm_steel, (-0.42, fy, 0.14), (-0.12, fy, 1.04), 0.028, 0.022, segments=14)
        add_tube_segment(bm_steel, (0.42, fy, 0.14), (0.12, fy, 1.04), 0.028, 0.022, segments=14)
        add_beveled_box(bm_steel, (0.58, 0.045, 0.045), (0.0, fy, 0.56), 0.006, segments=2)
        add_lathe_solid(
            bm_steel,
            [(0.062, -0.025), (0.068, 0.0), (0.062, 0.025)],
            segments=20,
            center_xyz=(-0.10, fy, 0.68),
            rot_euler=(math.pi * 0.5, 0.0, 0.0),
        )
    # Main arbor + upper pinion arbor + vertical regulator spindle
    add_tube_segment(bm_steel, (-0.10, -0.28, 0.68), (-0.10, 0.28, 0.68), 0.030, 0.030, segments=18)
    add_tube_segment(bm_steel, (0.35, -0.25, 0.92), (0.35, 0.25, 0.92), 0.024, 0.024, segments=16)
    add_tube_segment(bm_steel, (-0.10, 0.0, 0.14), (-0.10, 0.0, 1.38), 0.018, 0.014, segments=16)
    create_mesh_object(scene, "ClockworkSteelFrame", bm_steel, mat_steel, smooth=True, weighted_normals=True)

    # Precision interlocking brass bull gear (24T) + escapement wheel (18T) + astrolabe ring + corner finials
    bm_brass = bmesh.new()
    add_involute_gear(
        bm_brass,
        pitch_radius=0.36,
        teeth=24,
        thickness=0.052,
        bore_radius=0.25,
        center_xyz=(-0.10, -0.05, 0.68),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
    )
    # Hub & 6 radial spokes for main bull gear
    add_lathe_solid(
        bm_brass,
        [(0.055, -0.042), (0.082, -0.020), (0.082, 0.020), (0.055, 0.042)],
        segments=20,
        center_xyz=(-0.10, -0.05, 0.68),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
    )
    for sp in range(6):
        ang = (math.pi * 2.0 * sp) / 6.0
        gx = -0.10 + math.cos(ang) * 0.26
        gz = 0.68 + math.sin(ang) * 0.26
        add_tube_segment(bm_brass, (-0.10, -0.05, 0.68), (gx, -0.05, gz), 0.018, 0.014, segments=10)

    # Secondary brass escapement gear on upper arbor
    add_involute_gear(
        bm_brass,
        pitch_radius=0.21,
        teeth=18,
        thickness=0.038,
        bore_radius=0.05,
        center_xyz=(0.35, 0.07, 0.92),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
        phase=0.14,
    )
    # Horizontal crown wheel on regulator spindle
    add_involute_gear(
        bm_brass,
        pitch_radius=0.18,
        teeth=16,
        thickness=0.032,
        bore_radius=0.035,
        center_xyz=(-0.10, 0.0, 1.12),
    )
    # Tilted astrolabe meridian ring (segmented closed tube ring) + top finial + 4 base finials
    ring_pts = 24
    ring_r = 0.48
    tilt = mathutils.Euler((0.36, -0.22, 0.0), "XYZ").to_matrix() if False else None
    for i in range(ring_pts):
        a0 = (2.0 * math.pi * i) / ring_pts
        a1 = (2.0 * math.pi * (i + 1)) / ring_pts
        p0 = (-0.06 + ring_r * math.cos(a0), ring_r * math.sin(a0) * 0.34, 0.76 + ring_r * math.sin(a0) * 0.92)
        p1 = (-0.06 + ring_r * math.cos(a1), ring_r * math.sin(a1) * 0.34, 0.76 + ring_r * math.sin(a1) * 0.92)
        add_tube_segment(bm_brass, p0, p1, 0.016, 0.016, segments=10)

    for cx in (-0.54, 0.54):
        for cy in (-0.25, 0.25):
            add_lathe_solid(
                bm_brass,
                [(0.038, 0.0), (0.044, 0.02), (0.022, 0.055), (0.034, 0.085), (0.008, 0.125)],
                segments=16,
                center_xyz=(cx, cy, 0.14),
            )
    add_lathe_solid(
        bm_brass,
        [(0.040, 0.0), (0.052, 0.03), (0.020, 0.08), (0.006, 0.16)],
        segments=18,
        center_xyz=(-0.10, 0.0, 1.38),
    )
    create_mesh_object(scene, "ClockworkBrassGears", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    # Interlocking copper planetary pinion (14T) + secondary coaxial reduction gear (12T)
    bm_copper = bmesh.new()
    add_involute_gear(
        bm_copper,
        pitch_radius=0.19,
        teeth=14,
        thickness=0.048,
        bore_radius=0.045,
        center_xyz=(0.35, -0.05, 0.92),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
        phase=math.pi / 14.0,
    )
    add_involute_gear(
        bm_copper,
        pitch_radius=0.16,
        teeth=12,
        thickness=0.044,
        bore_radius=0.045,
        center_xyz=(-0.10, 0.08, 0.68),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
    )
    create_mesh_object(scene, "ClockworkCopperPinions", bm_copper, mat_copper, smooth=True, weighted_normals=True)

    # Faceted glowing chrono crystal suspended on regulator spindle
    bm_crystal = bmesh.new()
    add_lathe_solid(
        bm_crystal,
        [(0.008, -0.10), (0.068, 0.0), (0.008, 0.10)],
        segments=8,
        center_xyz=(-0.10, 0.0, 1.26),
    )
    create_mesh_object(scene, "ClockworkChronoCrystal", bm_crystal, mat_core, smooth=False)


def build_hanok_paljak_pavilion_bay(scene: bpy.types.Scene) -> None:
    mat_granite = make_mat("JoseonCarvedGranite", (0.68, 0.67, 0.65), roughness=0.72, metallic=0.0)
    mat_timber = make_mat("ZelkovaDancheongTimber", (0.47, 0.24, 0.14), roughness=0.48, metallic=0.02)
    mat_giwa = make_mat("TraditionalCharcoalGiwa", (0.16, 0.17, 0.20), roughness=0.44, metallic=0.12)
    mat_hanji = make_mat(
        "WarmHanjiChangho",
        (0.95, 0.91, 0.82),
        roughness=0.58,
        metallic=0.0,
        emission_color=(0.95, 0.84, 0.62),
        emission_strength=0.22,
    )

    # Two-tier granite stylobate (기단), front steps & 4 carved pillar bases (주춧돌)
    bm_stone = bmesh.new()
    add_beveled_box(bm_stone, (2.48, 2.08, 0.14), (0.0, 0.0, 0.07), 0.014, segments=2)
    add_beveled_box(bm_stone, (2.24, 1.84, 0.14), (0.0, 0.0, 0.21), 0.012, segments=2)
    for st in range(2):
        add_beveled_box(bm_stone, (0.74, 0.22, 0.09), (0.0, -1.03 - st * 0.18, 0.045 + (1 - st) * 0.09), 0.008, segments=2)
    pillar_xy = ((-0.86, -0.68), (0.86, -0.68), (-0.86, 0.68), (0.86, 0.68))
    for px, py in pillar_xy:
        add_lathe_solid(
            bm_stone,
            [(0.155, 0.0), (0.148, 0.06), (0.118, 0.10)],
            segments=16,
            center_xyz=(px, py, 0.28),
        )
    create_mesh_object(scene, "HanokGraniteGidan", bm_stone, mat_granite, smooth=True, weighted_normals=True)

    # Entasis pillars (배흘림기둥), maru floor, lintels (창방·평방), multi-tier gongpo brackets & rafters (서까래)
    bm_wood = bmesh.new()
    add_beveled_box(bm_wood, (1.88, 1.48, 0.06), (0.0, 0.0, 0.33), 0.008, segments=2)
    for px, py in pillar_xy:
        add_fluted_column_shaft(
            bm_wood,
            base_radius=0.098,
            top_radius=0.086,
            height=1.52,
            flutes=12,
            flute_depth=0.0,
            entasis=0.016,
            z_divisions=10,
            center_xyz=(px, py, 0.38),
        )
        # Bracket capital (주두 + 첨차 + 소로)
        add_beveled_box(bm_wood, (0.24, 0.24, 0.07), (px, py, 1.93), 0.008, segments=2)
        add_beveled_box(bm_wood, (0.42, 0.16, 0.065), (px, py, 2.00), 0.007, segments=2)
        add_beveled_box(bm_wood, (0.16, 0.42, 0.065), (px, py, 2.00), 0.007, segments=2)

    # Perimeter lintel beams (창방 & 평방)
    for py in (-0.68, 0.68):
        add_beveled_box(bm_wood, (1.96, 0.13, 0.11), (0.0, py, 1.84), 0.008, segments=2)
        add_beveled_box(bm_wood, (2.06, 0.15, 0.08), (0.0, py, 2.07), 0.008, segments=2)
    for px in (-0.86, 0.86):
        add_beveled_box(bm_wood, (0.13, 1.56, 0.11), (px, 0.0, 1.84), 0.008, segments=2)
        add_beveled_box(bm_wood, (0.15, 1.66, 0.08), (px, 0.0, 2.07), 0.008, segments=2)

    # Back lattice changho perimeter stiles/rails & proud muntin bars (leaving cells open for cream Hanji)
    for frame_x in (-0.77, 0.77):
        add_beveled_box(bm_wood, (0.055, 0.075, 1.38), (frame_x, 0.68, 1.08), 0.005, segments=1)
    for frame_z in (0.41, 1.75):
        add_beveled_box(bm_wood, (1.58, 0.075, 0.055), (0.0, 0.68, frame_z), 0.005, segments=1)
    for mx in (-0.38, 0.0, 0.38):
        add_beveled_box(bm_wood, (0.034, 0.068, 1.32), (mx, 0.68, 1.08), 0.004, segments=1)
    for mz in (0.74, 1.08, 1.42):
        add_beveled_box(bm_wood, (1.50, 0.068, 0.032), (0.0, 0.68, mz), 0.004, segments=1)

    # Radiating round rafters (서까래) front & back
    for i in range(9):
        rx = -1.04 + i * 0.26
        add_tube_segment(bm_wood, (rx, -0.30, 2.34), (rx * 1.06, -1.16, 2.02), 0.030, 0.024, segments=10)
        add_tube_segment(bm_wood, (rx, 0.30, 2.34), (rx * 1.06, 1.16, 2.02), 0.030, 0.024, segments=10)
    create_mesh_object(scene, "HanokZelkovaTimber", bm_wood, mat_timber, smooth=True, weighted_normals=True)

    # Hanji translucent screen sheet recessed inside the proud wooden muntin grid
    bm_hanji = bmesh.new()
    add_beveled_box(bm_hanji, (1.48, 0.030, 1.28), (0.0, 0.68, 1.08), 0.003, segments=1)
    create_mesh_object(scene, "HanokHanjiScreen", bm_hanji, mat_hanji, smooth=False)

    # Curved Paljak Giwa roof deck, upturned corner eaves, 용마루 ridge & 수키와 tile ribs
    bm_roof = bmesh.new()
    nx_div, ny_div = 12, 8
    verts_top: list[list[bmesh.types.BMVert]] = []
    verts_bot: list[list[bmesh.types.BMVert]] = []
    for iy in range(ny_div + 1):
        v_frac = (iy / ny_div) * 2.0 - 1.0  # -1 front .. +1 back
        ay = abs(v_frac)
        row_t: list[bmesh.types.BMVert] = []
        row_b: list[bmesh.types.BMVert] = []
        for ix in range(nx_div + 1):
            u_frac = (ix / nx_div) * 2.0 - 1.0  # -1 left .. +1 right
            ax = abs(u_frac)
            px = u_frac * (1.36 + 0.08 * (ay**2))
            py = v_frac * 1.22
            # Traditional concave Korean roof curve + corner eave lift (조로/귀솟음)
            slope_drop = 0.56 * (ay**1.35)
            corner_lift = 0.11 * (ax**2.2) * (ay**1.4)
            gable_lift = 0.04 * (ax**2.0)
            pz = 2.66 - slope_drop + corner_lift + gable_lift
            row_t.append(bm_roof.verts.new((px, py, pz)))
            row_b.append(bm_roof.verts.new((px * 0.985, py * 0.985, pz - 0.075)))
        verts_top.append(row_t)
        verts_bot.append(row_b)

    for iy in range(ny_div):
        for ix in range(nx_div):
            bm_roof.faces.new((verts_top[iy][ix], verts_top[iy][ix + 1], verts_top[iy + 1][ix + 1], verts_top[iy + 1][ix]))
            bm_roof.faces.new((verts_bot[iy][ix + 1], verts_bot[iy][ix], verts_bot[iy + 1][ix], verts_bot[iy + 1][ix + 1]))
    for ix in range(nx_div):
        bm_roof.faces.new((verts_bot[0][ix], verts_bot[0][ix + 1], verts_top[0][ix + 1], verts_top[0][ix]))
        bm_roof.faces.new((verts_top[ny_div][ix], verts_top[ny_div][ix + 1], verts_bot[ny_div][ix + 1], verts_bot[ny_div][ix]))
    for iy in range(ny_div):
        bm_roof.faces.new((verts_top[iy][0], verts_bot[iy][0], verts_bot[iy + 1][0], verts_top[iy + 1][0]))
        bm_roof.faces.new((verts_bot[iy][nx_div], verts_top[iy][nx_div], verts_top[iy + 1][nx_div], verts_bot[iy + 1][nx_div]))

    # Central 용마루 (main ridge) + 수키와 cylindrical tile ribs
    add_beveled_box(bm_roof, (2.78, 0.15, 0.13), (0.0, 0.0, 2.72), 0.018, segments=2)
    for side_sign in (-1.0, 1.0):
        for rib in range(9):
            rx = -1.12 + rib * 0.28
            add_tube_segment(
                bm_roof,
                (rx, side_sign * 0.08, 2.66),
                (rx * 1.04, side_sign * 1.20, 2.13 + 0.06 * ((abs(rx) / 1.12) ** 2)),
                0.026,
                0.028,
                segments=10,
            )
    create_mesh_object(scene, "HanokGiwaRoof", bm_roof, mat_giwa, smooth=True, weighted_normals=True)


def build_creator_ergonomic_chair_desk(scene: bpy.types.Scene) -> None:
    mat_oak = make_mat("ScandiNaturalOak", (0.72, 0.55, 0.36), roughness=0.44, metallic=0.0)
    mat_alloy = make_mat("AnodizedStudioSilver", (0.66, 0.69, 0.73), roughness=0.28, metallic=0.86)
    mat_graphite = make_mat("ErgonomicMeshGraphite", (0.15, 0.16, 0.19), roughness=0.52, metallic=0.14)
    mat_screen = make_mat(
        "CanvasPenDisplayGlow",
        (0.22, 0.44, 0.72),
        roughness=0.16,
        metallic=0.08,
        emission_color=(0.18, 0.38, 0.68),
        emission_strength=0.55,
    )

    # Motorized sit-stand oak tabletop
    bm_oak = bmesh.new()
    add_beveled_box(bm_oak, (1.56, 0.76, 0.036), (0.0, 0.26, 0.74), 0.008, segments=2)
    add_beveled_box(bm_oak, (0.58, 0.22, 0.024), (0.0, 0.48, 0.83), 0.005, segments=2)
    create_mesh_object(scene, "CreatorMotionDeskTop", bm_oak, mat_oak, smooth=True, weighted_normals=True)

    # Dual-column motorized T-legs + articulated monitor arm + chair 5-star aluminum base
    bm_alloy = bmesh.new()
    for lx in (-0.62, 0.62):
        add_beveled_box(bm_alloy, (0.09, 0.64, 0.032), (lx, 0.26, 0.016), 0.006, segments=2)
        add_beveled_box(bm_alloy, (0.075, 0.075, 0.38), (lx, 0.26, 0.21), 0.006, segments=2)
        add_beveled_box(bm_alloy, (0.062, 0.062, 0.36), (lx, 0.26, 0.54), 0.005, segments=2)
    add_beveled_box(bm_alloy, (1.30, 0.12, 0.042), (0.0, 0.28, 0.70), 0.006, segments=2)
    # Articulated monitor arm clamped at back
    add_tube_segment(bm_alloy, (-0.18, 0.56, 0.75), (-0.18, 0.56, 1.12), 0.024, 0.022, segments=14)
    add_tube_segment(bm_alloy, (-0.18, 0.56, 1.08), (-0.02, 0.44, 1.16), 0.018, 0.016, segments=12)

    # Ergonomic chair 5-star aluminum base + pneumatic cylinder at (0.0, -0.34)
    chair_x, chair_y = 0.0, -0.34
    add_lathe_solid(
        bm_alloy,
        [(0.032, 0.06), (0.032, 0.26), (0.024, 0.46)],
        segments=18,
        center_xyz=(chair_x, chair_y, 0.0),
    )
    for leg_i in range(5):
        ang = (2.0 * math.pi * leg_i) / 5.0 - math.pi * 0.5
        ex = chair_x + math.cos(ang) * 0.33
        ey = chair_y + math.sin(ang) * 0.33
        add_tube_segment(bm_alloy, (chair_x, chair_y, 0.095), (ex, ey, 0.055), 0.022, 0.016, segments=10)
    create_mesh_object(scene, "CreatorAlloyHardware", bm_alloy, mat_alloy, smooth=True, weighted_normals=True)

    # Casters, contoured ergonomic seat, lumbar backrest, headrest, armrests, monitor & pen display chassis
    bm_graph = bmesh.new()
    for leg_i in range(5):
        ang = (2.0 * math.pi * leg_i) / 5.0 - math.pi * 0.5
        ex = chair_x + math.cos(ang) * 0.33
        ey = chair_y + math.sin(ang) * 0.33
        add_lathe_solid(
            bm_graph,
            [(0.026, -0.022), (0.028, 0.0), (0.026, 0.022)],
            segments=14,
            center_xyz=(ex, ey, 0.028),
            rot_euler=(0.0, math.pi * 0.5, ang),
        )
    # Contoured seat cushion + backrest + lumbar pillow + headrest + 4D T-armrests
    add_beveled_box(bm_graph, (0.50, 0.48, 0.075), (chair_x, chair_y + 0.02, 0.48), 0.022, segments=2)
    add_beveled_box(
        bm_graph,
        (0.46, 0.055, 0.54),
        (chair_x, chair_y - 0.22, 0.80),
        0.018,
        segments=2,
        rot_euler=(0.14, 0.0, 0.0),
    )
    add_beveled_box(bm_graph, (0.28, 0.055, 0.14), (chair_x, chair_y - 0.26, 1.14), 0.016, segments=2, rot_euler=(-0.10, 0.0, 0.0))
    for side in (-0.28, 0.28):
        add_tube_segment(bm_graph, (chair_x + side, chair_y, 0.48), (chair_x + side, chair_y, 0.67), 0.016, 0.016, segments=10)
        add_beveled_box(bm_graph, (0.085, 0.24, 0.028), (chair_x + side, chair_y + 0.03, 0.68), 0.008, segments=2)

    # Reference monitor bezel + angled 22-inch pen display chassis + stylus dock + digital controller
    add_beveled_box(bm_graph, (0.74, 0.032, 0.42), (0.0, 0.42, 1.16), 0.007, segments=2)
    add_beveled_box(
        bm_graph,
        (0.54, 0.34, 0.028),
        (0.0, 0.12, 0.86),
        0.006,
        segments=2,
        rot_euler=(0.56, 0.0, 0.0),
    )
    add_lathe_solid(bm_graph, [(0.040, 0.0), (0.034, 0.035)], segments=16, center_xyz=(0.38, 0.14, 0.758))
    add_tube_segment(bm_graph, (0.38, 0.14, 0.78), (0.40, 0.16, 0.93), 0.007, 0.004, segments=10)
    add_beveled_box(bm_graph, (0.11, 0.06, 0.022), (0.64, -0.10, 0.74), 0.004, segments=1)
    create_mesh_object(scene, "CreatorChairAndDevices", bm_graph, mat_graphite, smooth=True, weighted_normals=True)

    # Active display screens (offset forward of bezels to avoid coplanar overlap)
    bm_scr = bmesh.new()
    add_beveled_box(bm_scr, (0.70, 0.012, 0.38), (0.0, 0.398, 1.16), 0.003, segments=1)
    add_beveled_box(
        bm_scr,
        (0.49, 0.29, 0.012),
        (0.0, 0.109, 0.876),
        0.003,
        segments=1,
        rot_euler=(0.56, 0.0, 0.0),
    )
    create_mesh_object(scene, "CreatorDisplayScreens", bm_scr, mat_screen, smooth=False)


def build_fantasy_potion_apothecary_cabinet(scene: bpy.types.Scene) -> None:
    mat_mahogany = make_mat("ApothecaryDarkMahogany", (0.29, 0.14, 0.10), roughness=0.42, metallic=0.03)
    mat_brass = make_mat("AlchemistAgedBrass", (0.79, 0.62, 0.29), roughness=0.28, metallic=0.90)
    mat_emerald = make_mat(
        "ElixirEmeraldGlow",
        (0.18, 0.86, 0.56),
        roughness=0.14,
        metallic=0.06,
        emission_color=(0.12, 0.78, 0.46),
        emission_strength=1.25,
    )
    mat_ruby = make_mat(
        "ElixirCrimsonGlow",
        (0.92, 0.22, 0.34),
        roughness=0.14,
        metallic=0.06,
        emission_color=(0.86, 0.16, 0.28),
        emission_strength=1.25,
    )

    # Carved mahogany cabinet: plinth, lower 6-drawer chest, waist counter, arched upper bookcase & cornice
    bm_wood = bmesh.new()
    add_beveled_box(bm_wood, (1.24, 0.52, 0.08), (0.0, 0.0, 0.04), 0.010, segments=2)
    add_beveled_box(bm_wood, (1.16, 0.46, 0.66), (0.0, 0.02, 0.41), 0.010, segments=2)
    add_beveled_box(bm_wood, (1.26, 0.54, 0.05), (0.0, 0.0, 0.765), 0.009, segments=2)

    # 6 drawer fronts (3 columns x 2 rows)
    for row_i, dz in enumerate((0.28, 0.56)):
        for col_i, dx in enumerate((-0.36, 0.0, 0.36)):
            add_beveled_box(bm_wood, (0.33, 0.032, 0.23), (dx, -0.22, dz), 0.006, segments=2)

    # Upper hutch back panel, side fluted pilasters, 2 display shelves & crown cornice
    add_beveled_box(bm_wood, (1.14, 0.05, 1.06), (0.0, 0.22, 1.32), 0.008, segments=2)
    for sx in (-0.54, 0.54):
        add_beveled_box(bm_wood, (0.08, 0.36, 1.06), (sx, 0.06, 1.32), 0.008, segments=2)
        add_fluted_column_shaft(
            bm_wood,
            base_radius=0.036,
            top_radius=0.032,
            height=1.02,
            flutes=10,
            flute_depth=0.004,
            entasis=0.003,
            z_divisions=6,
            center_xyz=(sx, -0.14, 0.80),
        )
    for sz in (1.14, 1.48):
        add_beveled_box(bm_wood, (1.02, 0.32, 0.034), (0.0, 0.06, sz), 0.006, segments=2)
    add_beveled_box(bm_wood, (1.28, 0.46, 0.07), (0.0, 0.04, 1.88), 0.012, segments=2)
    add_beveled_box(bm_wood, (0.96, 0.38, 0.08), (0.0, 0.04, 1.95), 0.012, segments=2)
    create_mesh_object(scene, "ApothecaryMahoganyCabinet", bm_wood, mat_mahogany, smooth=True, weighted_normals=True)

    # Brass drawer pulls, apothecary balance scale & bottle collars
    bm_brass = bmesh.new()
    for dz in (0.28, 0.56):
        for dx in (-0.36, 0.0, 0.36):
            add_lathe_solid(
                bm_brass,
                [(0.018, -0.012), (0.026, 0.012), (0.012, 0.026)],
                segments=14,
                center_xyz=(dx, -0.245, dz),
                rot_euler=(math.pi * 0.5, 0.0, 0.0),
            )
    # Balance scale on counter right
    sx, sy, sz0 = 0.28, -0.06, 0.79
    add_lathe_solid(
        bm_brass,
        [(0.065, 0.0), (0.052, 0.025), (0.014, 0.04), (0.012, 0.26), (0.022, 0.29)],
        segments=16,
        center_xyz=(sx, sy, sz0),
    )
    add_tube_segment(bm_brass, (sx - 0.14, sy, sz0 + 0.27), (sx + 0.14, sy, sz0 + 0.27), 0.008, 0.008, segments=10)
    for pan_dx in (-0.13, 0.13):
        add_lathe_solid(
            bm_brass,
            [(0.048, 0.0), (0.056, 0.018), (0.044, 0.024)],
            segments=16,
            center_xyz=(sx + pan_dx, sy, sz0 + 0.13),
        )
        add_tube_segment(bm_brass, (sx + pan_dx, sy, sz0 + 0.15), (sx + pan_dx, sy, sz0 + 0.27), 0.004, 0.004, segments=8)
    # Brass mortar & pestle on counter left (batched into hardware slot for mobile-hero <=4 draw calls)
    add_lathe_solid(
        bm_brass,
        [(0.058, 0.0), (0.088, 0.045), (0.096, 0.105), (0.072, 0.118)],
        segments=20,
        center_xyz=(-0.30, -0.06, 0.79),
    )
    add_tube_segment(bm_brass, (-0.30, -0.06, 0.86), (-0.23, -0.03, 0.99), 0.016, 0.022, segments=12)
    create_mesh_object(scene, "ApothecaryBrassHardware", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    # Faceted glowing elixir flasks across the shelves (emerald & ruby sets)
    bm_em = bmesh.new()
    bm_rb = bmesh.new()
    flask_profiles = (
        [(0.042, 0.0), (0.078, 0.065), (0.072, 0.135), (0.024, 0.185), (0.030, 0.225), (0.022, 0.250)],
        [(0.048, 0.0), (0.056, 0.145), (0.022, 0.195), (0.028, 0.235)],
    )
    emerald_spots = ((-0.34, 0.05, 1.157, 0, 10), (0.02, 0.05, 1.157, 1, 8), (-0.18, 0.05, 1.497, 0, 12), (0.30, 0.05, 1.497, 1, 8))
    ruby_spots = ((-0.16, 0.05, 1.157, 1, 8), (0.28, 0.05, 1.157, 0, 10), (0.06, 0.05, 1.497, 0, 10), (-0.36, 0.05, 1.497, 1, 6))
    for fx, fy, fz, p_idx, segs in emerald_spots:
        add_lathe_solid(bm_em, flask_profiles[p_idx], segments=segs, center_xyz=(fx, fy, fz))
    for fx, fy, fz, p_idx, segs in ruby_spots:
        add_lathe_solid(bm_rb, flask_profiles[p_idx], segments=segs, center_xyz=(fx, fy, fz))
    create_mesh_object(scene, "ApothecaryEmeraldElixirs", bm_em, mat_emerald, smooth=False)
    create_mesh_object(scene, "ApothecaryRubyElixirs", bm_rb, mat_ruby, smooth=False)
