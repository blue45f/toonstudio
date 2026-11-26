import { describe, expect, it } from "vitest";

import {
  COMPOSITOR_TILE_SIZE,
  MultiLayerTilePyramidCompositor,
  PRINT_PAGE_DIMENSIONS_MM,
  alignDualQuatHemisphere,
  classifyTileOpacityBounds,
  compareDqsVsLbsVolumeRetention,
  compilePsdCorrectiveRig,
  composeRigidTransforms,
  computeConvexPolygonDistanceMm,
  createTubularLimbMesh,
  dualQuatConjugate,
  dualQuatMultiply,
  dualQuatToRigidTransform,
  dualQuatTransformPoint,
  evaluateSkeletonSkinningState,
  extractBindSpacePsdDeltasFromSculpt,
  quatDot,
  quatFromAxisAngle,
  quatIdentity,
  quatRotateVec3,
  reflowComicLayoutBetweenFormats,
  rigidTransformToDualQuat,
  solveDualQuaternionSkinning,
  solvePanelBspPageLayout,
  type PanelBspNode,
  type RigBoneBindSpec,
  type RigidTransform3D,
  type Vec3,
} from "./index";

describe("wasm64-wave13-continuum: 부피 보존 DQS 및 가우시안 RBF PSD 스키닝 솔버", () => {
  it("강체 변환과 단위 듀얼 쿼터니언의 왕복 변환·곱셈·역변환 및 스터디 직교성을 만족한다", () => {
    const tfA: RigidTransform3D = {
      rotation: quatFromAxisAngle([0.3, -0.7, 0.5], 1.15),
      translation: [0.42, -1.25, 2.8],
    };
    const tfB: RigidTransform3D = {
      rotation: quatFromAxisAngle([-0.6, 0.2, 0.8], -0.85),
      translation: [-0.9, 0.55, 0.3],
    };

    const dqA = rigidTransformToDualQuat(tfA);
    const dqB = rigidTransformToDualQuat(tfB);

    expect(Math.hypot(...dqA.real)).toBeCloseTo(1, 10);
    expect(Math.abs(quatDot(dqA.real, dqA.dual))).toBeLessThan(1e-12);

    const recoveredA = dualQuatToRigidTransform(dqA);
    expect(recoveredA.translation[0]).toBeCloseTo(tfA.translation[0], 10);
    expect(recoveredA.translation[1]).toBeCloseTo(tfA.translation[1], 10);
    expect(recoveredA.translation[2]).toBeCloseTo(tfA.translation[2], 10);

    const samplePoint: Vec3 = [0.25, -0.4, 0.75];
    const composedRigid = composeRigidTransforms(tfA, tfB);
    const composedDq = dualQuatMultiply(dqA, dqB);

    const expectedPt = (() => {
      const r = quatRotateVec3(composedRigid.rotation, samplePoint);
      return [
        r[0] + composedRigid.translation[0],
        r[1] + composedRigid.translation[1],
        r[2] + composedRigid.translation[2],
      ] as const;
    })();
    const actualPt = dualQuatTransformPoint(composedDq, samplePoint);
    expect(actualPt[0]).toBeCloseTo(expectedPt[0], 10);
    expect(actualPt[1]).toBeCloseTo(expectedPt[1], 10);
    expect(actualPt[2]).toBeCloseTo(expectedPt[2], 10);

    const identityDq = dualQuatMultiply(dqA, dualQuatConjugate(dqA));
    const roundTripPt = dualQuatTransformPoint(identityDq, samplePoint);
    expect(roundTripPt[0]).toBeCloseTo(samplePoint[0], 10);
    expect(roundTripPt[1]).toBeCloseTo(samplePoint[1], 10);
    expect(roundTripPt[2]).toBeCloseTo(samplePoint[2], 10);
  });

  it("반구 대척점 부호 정렬(dot(q_ref, q_i) >= 0)로 음수 부호 듀얼 쿼터니언 꼬임을 방지한다", () => {
    const limb = createTubularLimbMesh({ axialSegments: 12, radialSegments: 16 });
    const dq0 = rigidTransformToDualQuat({
      rotation: quatIdentity(),
      translation: [0, 0, 0],
    });
    const dq1Positive = rigidTransformToDualQuat({
      rotation: quatFromAxisAngle([0, 0, 1], (110 * Math.PI) / 180),
      translation: [0.05, 0.1, 0],
    });
    const dq1Antipodal = {
      real: [
        -dq1Positive.real[0],
        -dq1Positive.real[1],
        -dq1Positive.real[2],
        -dq1Positive.real[3],
      ] as const,
      dual: [
        -dq1Positive.dual[0],
        -dq1Positive.dual[1],
        -dq1Positive.dual[2],
        -dq1Positive.dual[3],
      ] as const,
    };

    expect(quatDot(dq0.real, dq1Antipodal.real)).toBeLessThan(0);
    const alignedCheck = alignDualQuatHemisphere(dq0.real, dq1Antipodal);
    expect(alignedCheck.flipped).toBe(true);
    expect(quatDot(dq0.real, alignedCheck.aligned.real)).toBeGreaterThanOrEqual(0);

    const posSkin = solveDualQuaternionSkinning(limb.mesh, [dq0, dq1Positive]);
    const antiSkin = solveDualQuaternionSkinning(limb.mesh, [dq0, dq1Antipodal]);

    expect(antiSkin.telemetry.antipodalFlipsApplied).toBeGreaterThan(0);
    expect(antiSkin.telemetry.maxOrthogonalityResidual).toBeLessThan(1e-12);

    for (let i = 0; i < posSkin.positions.length; i += 1) {
      expect(antiSkin.positions[i][0]).toBeCloseTo(posSkin.positions[i][0], 10);
      expect(antiSkin.positions[i][1]).toBeCloseTo(posSkin.positions[i][1], 10);
      expect(antiSkin.positions[i][2]).toBeCloseTo(posSkin.positions[i][2], 10);
    }
  });

  it("90°~150° 전완 비틀림 및 팔꿈치 굽힘에서 LBS 사탕 포장지 부피 붕괴 대비 DQS 0% 단면 붕괴를 정량 증명한다", () => {
    const limb = createTubularLimbMesh({
      lengthMeters: 0.6,
      radiusMeters: 0.05,
      axialSegments: 24,
      radialSegments: 24,
    });

    for (const twistDeg of [90, 120, 150]) {
      const twistRad = (twistDeg * Math.PI) / 180;
      const transforms: readonly RigidTransform3D[] = [
        { rotation: quatIdentity(), translation: [0, 0, 0] },
        { rotation: quatFromAxisAngle([1, 0, 0], twistRad), translation: [0, 0, 0] },
      ];
      const report = compareDqsVsLbsVolumeRetention(limb, transforms);

      // DQS는 축 비틀림에서 중앙 단면 면적 및 축방향 적분 원통 부피 붕괴가 정확히 0%다.
      expect(report.dqsMidAreaCollapsePct).toBeLessThan(1e-9);
      expect(report.dqsSliceVolumeCollapsePct).toBeLessThan(1e-9);
      expect(report.dqsVolumeCollapsePct).toBeLessThan(1.5);

      // 반면 LBS는 cos²(θ/2) 법칙에 따라 90°에서 50%, 150°에서 ~93.3% 단면 붕괴가 발생한다.
      const expectedLbsAreaRatio = Math.cos(twistRad * 0.5) ** 2;
      expect(report.lbsMidCrossSectionAreaRatio).toBeCloseTo(expectedLbsAreaRatio, 4);
      expect(report.lbsMidAreaCollapsePct).toBeGreaterThan(49);
      expect(report.lbsSliceVolumeCollapsePct).toBeGreaterThan(12);
      expect(report.dqsVolume).toBeGreaterThan(report.lbsVolume * 1.12);
      if (twistDeg === 150) {
        expect(report.lbsMidAreaCollapsePct).toBeGreaterThan(93);
      }
    }

    const armBones: readonly RigBoneBindSpec[] = [
      {
        id: "upperArm",
        labelKo: "상완",
        parentIndex: -1,
        bindLocalTransform: { rotation: quatIdentity(), translation: [-0.3, 0, 0] },
      },
      {
        id: "forearm",
        labelKo: "전완",
        parentIndex: 0,
        bindLocalTransform: { rotation: quatIdentity(), translation: [0.3, 0, 0] },
      },
    ];

    for (const bendDeg of [90, 120, 150]) {
      const bendRad = (bendDeg * Math.PI) / 180;
      const state = evaluateSkeletonSkinningState(armBones, {
        forearm: { rotation: quatFromAxisAngle([0, 0, 1], bendRad) },
      });
      const report = compareDqsVsLbsVolumeRetention(limb, state.skinningTransforms);

      // 관절 중심(x = 0) 링에서 DQS 반경·단면적 붕괴는 0%이며 LBS 대비 월등한 부피를 유지한다.
      expect(report.dqsMidAreaCollapsePct).toBeLessThan(1e-9);
      expect(report.lbsMidAreaCollapsePct).toBeGreaterThan(20);
      expect(report.dqsVolumeRatio).toBeGreaterThan(report.lbsVolumeRatio);
    }
  });

  it("가우시안 RBF 포즈 공간 변형(PSD)으로 휴식 포즈 0 변형 및 굽힘 포즈 이두근 융기·주름 보정을 정확히 복원한다", () => {
    const limb = createTubularLimbMesh({
      lengthMeters: 0.6,
      radiusMeters: 0.05,
      axialSegments: 16,
      radialSegments: 16,
    });
    const armBones: readonly RigBoneBindSpec[] = [
      {
        id: "upperArm",
        labelKo: "상완",
        parentIndex: -1,
        bindLocalTransform: { rotation: quatIdentity(), translation: [-0.3, 0, 0] },
      },
      {
        id: "forearm",
        labelKo: "전완",
        parentIndex: 0,
        bindLocalTransform: { rotation: quatIdentity(), translation: [0.3, 0, 0] },
      },
    ];

    const pose90 = evaluateSkeletonSkinningState(
      armBones,
      { forearm: { rotation: quatFromAxisAngle([0, 0, 1], Math.PI * 0.5) } },
      ["forearm"],
    );
    const baseDqs90 = solveDualQuaternionSkinning(limb.mesh, pose90.skinningDualQuats);
    const targetVertex = limb.midRingVertexIndices[0];
    const sculpted90 = baseDqs90.positions.map((pt, idx): Vec3 =>
      idx === targetVertex ? [pt[0] - 0.012, pt[1] + 0.018, pt[2]] : pt,
    );
    const deltas90 = extractBindSpacePsdDeltasFromSculpt(
      limb.mesh.positions,
      limb.mesh.influences,
      pose90.skinningDualQuats,
      sculpted90,
    );

    const pose135 = evaluateSkeletonSkinningState(
      armBones,
      { forearm: { rotation: quatFromAxisAngle([0, 0, 1], (135 * Math.PI) / 180) } },
      ["forearm"],
    );
    const baseDqs135 = solveDualQuaternionSkinning(limb.mesh, pose135.skinningDualQuats);
    const sculpted135 = baseDqs135.positions.map((pt, idx): Vec3 =>
      idx === targetVertex ? [pt[0] - 0.022, pt[1] + 0.031, pt[2] + 0.005] : pt,
    );
    const deltas135 = extractBindSpacePsdDeltasFromSculpt(
      limb.mesh.positions,
      limb.mesh.influences,
      pose135.skinningDualQuats,
      sculpted135,
    );

    const psdRig = compilePsdCorrectiveRig(limb.mesh.positions.length, [
      {
        id: "elbow_bicep_90",
        labelKo: "팔꿈치 90도 이두근 융기",
        poseFeatures: pose90.poseFeatures,
        vertexDeltas: deltas90,
        sigma: 0.7,
      },
      {
        id: "elbow_crease_135",
        labelKo: "팔꿈치 135도 소매 주름",
        poseFeatures: pose135.poseFeatures,
        vertexDeltas: deltas135,
        sigma: 0.7,
      },
    ]);

    // 1) 기본 휴식 포즈(0도)에서는 보정 델타가 0이어야 한다.
    const restState = evaluateSkeletonSkinningState(armBones, {}, ["forearm"]);
    const restSolved = solveDualQuaternionSkinning(limb.mesh, restState.skinningDualQuats, {
      psdRig,
      poseFeatures: restState.poseFeatures,
    });
    expect(restSolved.telemetry.maxPsdDeltaMagnitude).toBeLessThan(1e-10);

    // 2) 90도·135도 예제 포즈에서는 조각한 월드 좌표를 정밀 재현한다.
    const solved90 = solveDualQuaternionSkinning(limb.mesh, pose90.skinningDualQuats, {
      psdRig,
      poseFeatures: pose90.poseFeatures,
      recomputeNormalsFromTriangles: true,
    });
    expect(solved90.positions[targetVertex][0]).toBeCloseTo(sculpted90[targetVertex][0], 5);
    expect(solved90.positions[targetVertex][1]).toBeCloseTo(sculpted90[targetVertex][1], 5);
    expect(solved90.positions[targetVertex][2]).toBeCloseTo(sculpted90[targetVertex][2], 5);

    const solved135 = solveDualQuaternionSkinning(limb.mesh, pose135.skinningDualQuats, {
      psdRig,
      poseFeatures: pose135.poseFeatures,
    });
    expect(solved135.positions[targetVertex][0]).toBeCloseTo(sculpted135[targetVertex][0], 5);
    expect(solved135.positions[targetVertex][1]).toBeCloseTo(sculpted135[targetVertex][1], 5);
    expect(solved135.positions[targetVertex][2]).toBeCloseTo(sculpted135[targetVertex][2], 5);
  });
});

describe("wasm64-wave13-continuum: 256×256 조기 차폐 밉 타일 합성기 및 BSP 컷 리플로우 솔버", () => {
  it("256×256 타일 투명도 경계 분류 및 전방→후방 불투명 차폐로 하위 레이어 합성을 생략한다", () => {
    expect(COMPOSITOR_TILE_SIZE).toBe(256);

    const testBuf = new Uint8ClampedArray(16 * 16 * 4);
    expect(classifyTileOpacityBounds(testBuf, 16, 16, 16).bound).toBe("fullyTransparent");
    for (let i = 3; i < testBuf.length; i += 4) testBuf[i] = 255;
    expect(classifyTileOpacityBounds(testBuf, 16, 16, 16).bound).toBe("fullyOpaque");
    testBuf[3] = 128;
    expect(classifyTileOpacityBounds(testBuf, 16, 16, 16).bound).toBe("mixed");

    // 4096×8192 초대형 캔버스 (16×32 = 512개 기본 타일)
    const compositor = new MultiLayerTilePyramidCompositor(4096, 8192);
    compositor.addLayer({ id: "bg_draft", labelKo: "하위 밑그림" });
    compositor.addLayer({ id: "mid_tone", labelKo: "중간 채색" });
    compositor.addLayer({ id: "ink_fill", labelKo: "상위 불투명 먹채움" });
    compositor.addLayer({ id: "fx_screen", labelKo: "최상위 스크린 발광", blendMode: "screen", opacity: 0.5 });

    // 타일 (2, 3) = [512..768, 768..1024) 전체를 하위 3개 레이어에 모두 칠함
    const tileRect = { x: 512, y: 768, width: 256, height: 256 };
    compositor.paintSolidRect("bg_draft", tileRect, [250, 20, 20, 255]);
    compositor.paintSolidRect("mid_tone", tileRect, [20, 240, 30, 200]);
    compositor.paintSolidRect("ink_fill", tileRect, [30, 60, 180, 255]);

    expect(compositor.getLayerTileOpacityBound("bg_draft", 2, 3)).toBe("fullyOpaque");
    expect(compositor.getLayerTileOpacityBound("mid_tone", 2, 3)).toBe("mixed");
    expect(compositor.getLayerTileOpacityBound("ink_fill", 2, 3)).toBe("fullyOpaque");
    expect(compositor.getLayerTileOpacityBound("fx_screen", 2, 3)).toBe("fullyTransparent");

    const telemetry = compositor.flushDirtyPyramid();
    expect(telemetry.totalBaseTiles).toBe(512);
    expect(telemetry.recompositedBaseTiles).toBe(1);
    // ink_fill이 완전 불투명(fullyOpaque)이므로 아래 2개 레이어(mid_tone, bg_draft)는 조기 차폐되어 읽지 않는다!
    expect(telemetry.occludedUnderLayerTiles).toBe(2);
    expect(telemetry.blendedLayerTileReads).toBe(1);
    expect(telemetry.fastOpaqueTileCopies).toBe(1);
    expect(compositor.sampleCompositePixel(600, 800)).toEqual([30, 60, 180, 255]);

    // 차폐된 하위 레이어를 바꿔도 상위 불투명 타일이 가로막아 결과 픽셀은 불변이며 하위 블렌딩은 생략된다.
    compositor.paintSolidRect("bg_draft", { x: 520, y: 780, width: 32, height: 32 }, [255, 255, 0, 255]);
    const secondFlush = compositor.flushDirtyPyramid();
    expect(secondFlush.recompositedBaseTiles).toBe(1);
    expect(secondFlush.occludedUnderLayerTiles).toBe(2);
    expect(secondFlush.blendedLayerTileReads).toBe(1);
    expect(compositor.sampleCompositePixel(530, 790)).toEqual([30, 60, 180, 255]);

    // 최상위 스크린 블렌드 레이어에 칠해도 불투명 스토퍼(ink_fill) 아래 2개 레이어는 여전히 차폐된다.
    compositor.paintSolidRect("fx_screen", { x: 512, y: 768, width: 64, height: 64 }, [200, 100, 40, 255]);
    const thirdFlush = compositor.flushDirtyPyramid();
    expect(thirdFlush.occludedUnderLayerTiles).toBe(2);
    expect(thirdFlush.blendedLayerTileReads).toBe(2);
    const litPixel = compositor.sampleCompositePixel(520, 780);
    expect(litPixel[0]).toBeGreaterThan(30);
    expect(litPixel[3]).toBe(255);
  });

  it("더티 직사각형 영역에 한해서만 1/2·1/4·1/8 밉 피라미드 타일을 증분 갱신한다", () => {
    const compositor = new MultiLayerTilePyramidCompositor(4096, 8192);
    compositor.addLayer({ id: "base", labelKo: "원고 바탕" });
    compositor.addLayer({ id: "line", labelKo: "펜선 레이어" });

    // 타일 (5, 7) 내부의 32×32 국소 브러시 영역만 수정
    compositor.paintSolidRect("line", { x: 1312, y: 1824, width: 32, height: 32 }, [200, 80, 40, 255]);
    const stats = compositor.flushDirtyPyramid();

    expect(stats.recompositedBaseTiles).toBe(1);
    expect(stats.updatedMipTilesByLevel).toEqual({
      "1/2": 1,
      "1/4": 1,
      "1/8": 1,
    });
    expect(stats.updatedMipPixelsByLevel).toEqual({
      "1/2": 16 * 16,
      "1/4": 8 * 8,
      "1/8": 4 * 4,
    });

    expect(compositor.sampleMipPixel("1/2", 660, 916)).toEqual([200, 80, 40, 255]);
    expect(compositor.sampleMipPixel("1/4", 330, 458)).toEqual([200, 80, 40, 255]);
    expect(compositor.sampleMipPixel("1/8", 165, 229)).toEqual([200, 80, 40, 255]);
    expect(compositor.sampleMipPixel("1/2", 10, 10)).toEqual([0, 0, 0, 0]);
  });

  it("직교·사선 BSP 컷 분할에서 균일 수직 칸새, 3mm 도련, 5mm 안전 여백 클램핑 및 무손실 왕복 리플로우를 보장한다", () => {
    const episodeTree: PanelBspNode = {
      kind: "split",
      id: "root_h",
      axis: "horizontal",
      ratio: 0.42,
      tiltDeg: -12,
      gutterMm: 4,
      primary: {
        kind: "leaf",
        panelId: "cut_1_opening",
        labelKo: "1컷 전면 도입부",
        dramaticWeight: 1.4,
        focalPointUv: [0.5, 0.35],
        fullBleed: true,
        balloons: [
          {
            id: "b_edge_risk",
            labelKo: "재단선 침범 위험 대사",
            uv: [0.99, 0.01],
            radiusMm: 9,
          },
        ],
      },
      secondary: {
        kind: "split",
        id: "bottom_v",
        axis: "vertical",
        ratio: 0.55,
        tiltDeg: 15,
        gutterMm: 5,
        primary: {
          kind: "leaf",
          panelId: "cut_2_reaction",
          labelKo: "2컷 인물 반응",
          dramaticWeight: 1.0,
          focalPointUv: [0.4, 0.5],
        },
        secondary: {
          kind: "leaf",
          panelId: "cut_3_climax",
          labelKo: "3컷 클라이맥스",
          dramaticWeight: 1.25,
          focalPointUv: [0.6, 0.45],
          balloons: [
            {
              id: "b_safe_center",
              labelKo: "안전 영역 중앙 대사",
              uv: [0.5, 0.5],
              radiusMm: 6,
            },
          ],
        },
      },
    };

    const a4Layout = solvePanelBspPageLayout(episodeTree, {
      preset: "A4",
      bleedMm: 3,
      safeMarginMm: 5,
      defaultGutterMm: 4,
    });

    expect(a4Layout.trimBoxMm).toEqual({
      x: 0,
      y: 0,
      width: PRINT_PAGE_DIMENSIONS_MM.A4.widthMm,
      height: PRINT_PAGE_DIMENSIONS_MM.A4.heightMm,
    });
    expect(a4Layout.bleedBoxMm).toEqual({ x: -3, y: -3, width: 216, height: 303 });
    expect(a4Layout.safeBoxMm).toEqual({ x: 5, y: 5, width: 200, height: 287 });
    expect(a4Layout.panels).toHaveLength(3);

    const [cut1, cut2, cut3] = a4Layout.panels;
    // 1컷은 fullBleed이므로 바깥 경계가 -3mm 도련까지 확장된다.
    expect(cut1.boundsMm.x).toBeCloseTo(-3, 6);
    expect(cut1.boundsMm.y).toBeCloseTo(-3, 6);
    expect(cut1.cssClipPath.startsWith("polygon(")).toBe(true);

    // 1컷 모서리에 배치된 말풍선은 5mm 안전 여백 안쪽으로 자동 클램핑된다.
    expect(cut1.balloons[0].wasClampedToSafeZone).toBe(true);
    expect(cut1.balloons[0].minSafeClearanceMm).toBeGreaterThanOrEqual(-1e-5);
    expect(cut1.balloons[0].centerMm[0] + cut1.balloons[0].radiusMm).toBeLessThanOrEqual(205.001);
    expect(cut1.balloons[0].centerMm[1] - cut1.balloons[0].radiusMm).toBeGreaterThanOrEqual(4.999);

    // 사선 분할된 2컷과 3컷 사이의 최소 수직 거리는 지정된 칸새 폭(5mm)과 정확히 일치한다.
    const diagonalGutterDist = computeConvexPolygonDistanceMm(
      cut2.clipPolygonMm,
      cut3.clipPolygonMm,
    );
    expect(diagonalGutterDist).toBeCloseTo(5, 5);

    // 세로 웹툰 스트립 -> A4 양면 펼침 -> B5 단면 -> 세로 웹툰 스트립 비파괴 왕복 검증
    const stripInitial = reflowComicLayoutBetweenFormats(episodeTree, "webtoon-vertical");
    const a4Spread = reflowComicLayoutBetweenFormats(
      stripInitial.sourceTreeSnapshot,
      "A4-spread",
    );
    const b5Single = reflowComicLayoutBetweenFormats(a4Spread.sourceTreeSnapshot, "B5-single");
    const stripRoundTrip = reflowComicLayoutBetweenFormats(
      b5Single.sourceTreeSnapshot,
      "webtoon-vertical",
    );

    expect(a4Spread.printPages[0].trimBoxMm.width).toBe(420);
    expect(b5Single.printPages[0].trimBoxMm).toEqual({ x: 0, y: 0, width: 182, height: 257 });
    expect(stripRoundTrip.webtoonStrip).toEqual(stripInitial.webtoonStrip);
    expect(stripRoundTrip.webtoonStrip?.panels.map((p) => p.panelId)).toEqual([
      "cut_1_opening",
      "cut_2_reaction",
      "cut_3_climax",
    ]);
  });
});
