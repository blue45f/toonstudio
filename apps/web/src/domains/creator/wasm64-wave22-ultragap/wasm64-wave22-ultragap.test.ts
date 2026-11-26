import { describe, expect, it } from "vitest";

import {
  buildGaussLegendreArcLengthTable,
  bytesToHex,
  createInMemoryOpfsTileVolume,
  createOpfsIdleMerkleScrubber,
  createOrnamentalMotifTemplate,
  decodeHlgOetf,
  decodePqSt2084,
  DEFAULT_HDR_PEAK_EMISSIVE_NITS,
  DEFAULT_OPFS_SCRUB_IDLE_BUDGET_MS,
  deformRibbonMotifAlongSpline,
  encodeHlgOetf,
  encodePqSt2084,
  HDR_DIFFUSE_WHITE_NITS,
  hlgSignalToNits,
  mapSelectiveEmissiveHdrAndGainMap,
  MAX_PHYSIOLOGICAL_EYE_DEG,
  nitsToHlgSignal,
  projectLayerPerspectiveCastShadow,
  projectSilhouetteSampleToShadow,
  reconstructHdrNitsFromGainMap,
  sampleSplineAtArcLength,
  sha256Digest,
  simulateOculoCephalicGazeTrajectory,
  solveOculoCephalicLookAt,
  type CubicRibbonSplineSegment,
  type RibbonMotifKind,
} from "./index";

describe("Wasm64 Wave 22 Ultragap — 선택적 발광 HDR PQ/HLG 및 ISO-21496-1 게인맵 톤매퍼", () => {
  it("SMPTE ST.2084 PQ 및 ITU-R BT.2100 HLG 인코딩·디코딩 왕복 정밀도와 203 nits 기준점을 검증한다", () => {
    const testNits = [0, 0.5, 18, 100, HDR_DIFFUSE_WHITE_NITS, 500, 1000, 4000, 10000];
    for (const nits of testNits) {
      const pq = encodePqSt2084(nits);
      const decoded = decodePqSt2084(pq);
      expect(decoded).toBeCloseTo(nits, 3);
    }

    // ITU-R BT.2408 표준 기준 백색: 203 nits ≈ 58.07% PQ, 약 75.00% HLG
    expect(encodePqSt2084(HDR_DIFFUSE_WHITE_NITS)).toBeCloseTo(0.580689, 5);
    expect(encodePqSt2084(DEFAULT_HDR_PEAK_EMISSIVE_NITS)).toBeCloseTo(0.751827, 5);

    const hlg203 = nitsToHlgSignal(HDR_DIFFUSE_WHITE_NITS, 1000);
    expect(hlg203).toBeCloseTo(0.75, 2);
    expect(hlgSignalToNits(hlg203, 1000)).toBeCloseTo(HDR_DIFFUSE_WHITE_NITS, 3);

    for (const rel of [0, 0.02, 1 / 12, 0.25, 0.6, 1]) {
      expect(decodeHlgOetf(encodeHlgOetf(rel))).toBeCloseTo(rel, 6);
    }
  });

  it("종이·피부는 203 nits에 고정하고 검기·마법 발광만 1,000 nits로 승격하며 무클리핑 SDR + 게인맵 복원을 수행한다", () => {
    const width = 4;
    const height = 1;
    // 픽셀 0: 순백 종이 여백, 픽셀 1: 보호된 피부톤(발광 번짐 유입), 픽셀 2: 검기 외곽 후광, 픽셀 3: 검기 중심 코어
    const linearRgba = new Float32Array([
      1.0, 1.0, 1.0, 1.0,
      0.85, 0.68, 0.58, 1.0,
      0.25, 0.88, 1.0, 1.0,
      1.0, 0.96, 0.85, 1.0,
    ]);
    const emissiveMask = new Float32Array([0.0, 0.65, 0.55, 1.0]);
    const paperSkinProtectMask = new Float32Array([1.0, 1.0, 0.0, 0.0]);

    const pqMapped = mapSelectiveEmissiveHdrAndGainMap({
      width,
      height,
      linearRgba,
      emissiveMask,
      paperSkinProtectMask,
      transferFunction: "pq",
    });

    expect(pqMapped.serverCostKrw).toBe(0);
    // 종이 백색은 정확히 203 nits에 고정된다.
    expect(pqMapped.hdrNitsRgba[0]).toBeCloseTo(203, 4);
    expect(pqMapped.hdrNitsRgba[1]).toBeCloseTo(203, 4);
    expect(pqMapped.hdrNitsRgba[2]).toBeCloseTo(203, 4);

    // 보호 마스크가 씌워진 피부는 발광 마스크가 일부 겹쳐도 절대 203 nits를 넘지 않는다.
    expect(pqMapped.maxDiffuseProtectedNits).toBeLessThanOrEqual(203.0001);
    expect(pqMapped.hdrNitsRgba[4]).toBeCloseTo(203 * 0.85, 3);

    // 검기 코어(픽셀 3, R=1.0, emissive=1.0)는 1,000 nits까지 상승한다.
    expect(pqMapped.hdrNitsRgba[12]).toBeCloseTo(1000, 3);
    expect(pqMapped.maxEmissiveOutputNits).toBeCloseTo(1000, 3);

    // SDR 폴백은 발광 픽셀에서도 하드 클리핑(>= 1.0)이 0건이며 외곽 후광 < 코어 밝기 순서를 보존한다.
    expect(pqMapped.clippedSdrEmissiveChannelCount).toBe(0);
    const haloBlueSdr = pqMapped.sdrLinearRgba[10]!;
    const coreRedSdr = pqMapped.sdrLinearRgba[12]!;
    expect(haloBlueSdr).toBeLessThan(1.0);
    expect(coreRedSdr).toBeLessThan(1.0);
    expect(coreRedSdr).toBeGreaterThan(pqMapped.sdrLinearRgba[8]!);

    // ISO-21496-1 게인맵 복원: HDR 가중치 1.0일 때 원본 HDR nits를 복원하고, 0.0일 때 SDR 범위로 수렴한다.
    const reconstructedHdr = reconstructHdrNitsFromGainMap(
      pqMapped.sdrLinearRgba,
      pqMapped.gainMapQuantized8,
      pqMapped.gainMapMetadata,
      1.0,
    );
    expect(reconstructedHdr[0]).toBeCloseTo(203, 0);
    expect(Math.abs((reconstructedHdr[12] ?? 0) - 1000)).toBeLessThan(8);

    const reconstructedSdr = reconstructHdrNitsFromGainMap(
      pqMapped.sdrLinearRgba,
      pqMapped.gainMapQuantized8,
      pqMapped.gainMapMetadata,
      0.0,
    );
    expect(reconstructedSdr[12]).toBeLessThanOrEqual(203.01);

    // HLG 모드 동작도 함께 검증한다.
    const hlgMapped = mapSelectiveEmissiveHdrAndGainMap({
      width,
      height,
      linearRgba,
      emissiveMask,
      paperSkinProtectMask,
      transferFunction: "hlg",
    });
    expect(hlgMapped.hdrEncodedRgba[0]).toBeCloseTo(0.75, 2);
    expect(hlgMapped.hdrEncodedRgba[12]).toBeCloseTo(1.0, 4);
  });
});

describe("Wasm64 Wave 22 Ultragap — 호길이 곡률 안전(r·κ < 1) 리본·체인·레이스 브러시 변형기", () => {
  it("비대칭 제어점 스플라인에서도 5점 가우스-르장드르 호길이 등간격 샘플링을 보장한다", () => {
    const segments: readonly CubicRibbonSplineSegment[] = [
      {
        p0: { x: 0, y: 0 },
        p1: { x: 8, y: 0 },
        p2: { x: 180, y: 120 },
        p3: { x: 240, y: 120 },
      },
    ];
    const table = buildGaussLegendreArcLengthTable(segments, 48);
    expect(table.totalArcLength).toBeGreaterThan(240);

    const stepCount = 12;
    const expectedStep = table.totalArcLength / stepCount;
    let prev = sampleSplineAtArcLength(table, 0).position;

    for (let i = 1; i <= stepCount; i += 1) {
      const curr = sampleSplineAtArcLength(table, i * expectedStep).position;
      const chord = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      // 곡선 현 길이는 호길이와 매우 가깝고 제어점 밀집도와 무관하게 일정해야 한다.
      expect(chord).toBeGreaterThan(expectedStep * 0.96);
      expect(chord).toBeLessThanOrEqual(expectedStep * 1.005);
      prev = curr;
    }
  });

  it("급격한 헤어핀 커브에서 안쪽 오프셋을 r·κ < 1로 제한해 자가 교차를 막고 필압·원근 테이퍼를 반영한다", () => {
    const hairpinSegments: readonly CubicRibbonSplineSegment[] = [
      {
        p0: { x: 0, y: 0 },
        p1: { x: 90, y: 0 },
        p2: { x: 90, y: 18 },
        p3: { x: 0, y: 18 },
        pressureStart: 1.0,
        pressureEnd: 0.35,
        perspectiveScaleStart: 1.3,
        perspectiveScaleEnd: 0.55,
      },
    ];

    const motifKinds: readonly RibbonMotifKind[] = ["chain", "braid", "lace", "zipper"];
    for (const kind of motifKinds) {
      const template = createOrnamentalMotifTemplate(kind, 20);
      expect(template.vertices.length).toBeGreaterThanOrEqual(8);

      const result = deformRibbonMotifAlongSpline({
        segments: hairpinSegments,
        motifKind: kind,
        baseHalfWidthPx: 26,
        maxInnerRadiusKappa: 0.85,
      });

      expect(result.serverCostKrw).toBe(0);
      expect(result.tileCount).toBeGreaterThanOrEqual(4);
      expect(result.clampedInnerVertexCount).toBeGreaterThan(0);
      // 모든 정점에서 r·κ < 1 이며 종방향 야코비안 > 0 (리본 뒤집힘 0건)
      expect(result.maxObservedInnerRadiusKappa).toBeLessThan(0.86);
      expect(result.minLongitudinalJacobian).toBeGreaterThan(0.14);

      for (const v of result.vertices) {
        expect(v.radiusCurvatureProduct).toBeLessThan(1.0);
        expect(v.longitudinalJacobian).toBeGreaterThan(0);
      }
    }

    // 체인 모티프에서 시작 타일(고필압·근경)이 끝 타일(저필압·원경)보다 넓은 폭을 갖는지 확인한다.
    const chainRes = deformRibbonMotifAlongSpline({
      segments: [
        {
          p0: { x: 0, y: 0 },
          p1: { x: 80, y: 0 },
          p2: { x: 160, y: 0 },
          p3: { x: 240, y: 0 },
          pressureStart: 1.0,
          pressureEnd: 0.3,
          perspectiveScaleStart: 1.25,
          perspectiveScaleEnd: 0.5,
        },
      ],
      motifKind: "chain",
      baseHalfWidthPx: 18,
    });
    const firstTileMaxOffset = Math.max(
      ...chainRes.vertices.filter((v) => v.motifIndex === 0).map((v) => Math.abs(v.effectiveOffsetPx)),
    );
    const lastTileIndex = chainRes.tileCount - 1;
    const lastTileMaxOffset = Math.max(
      ...chainRes.vertices.filter((v) => v.motifIndex === lastTileIndex).map((v) => Math.abs(v.effectiveOffsetPx)),
    );
    expect(firstTileMaxOffset).toBeGreaterThan(lastTileMaxOffset * 2.5);
  });
});

describe("Wasm64 Wave 22 Ultragap — 생체역학 안구-두부-상체(Oculo-Cephalic) 시선 협응 솔버", () => {
  it("중간 시선각에서는 35% : 45% : 20% 비율로 배분하고 극단 시선각에서도 안구를 ±28° 이내로 보호한다", () => {
    // 40° 우측 응시: tan(40°) * 10m
    const moderate = solveOculoCephalicLookAt({
      eyePivotWorld: { x: 0, y: 1.6, z: 0 },
      targetWorld: { x: Math.tan((40 * Math.PI) / 180) * 10, y: 1.6, z: 10 },
    });

    expect(moderate.targetYawDeg).toBeCloseTo(40, 3);
    expect(moderate.cyclopeanEye.yawDeg).toBeCloseTo(40 * 0.35, 2);
    expect(moderate.headNeck.yawDeg).toBeCloseTo(40 * 0.45, 2);
    expect(moderate.upperTorso.yawDeg).toBeCloseTo(40 * 0.2, 2);
    expect(moderate.residualErrorDeg).toBeLessThan(1e-4);

    // 100° 대각선 큰 회전 + 근접 주시(0.25m): 안구 단독 회전 시 흰자위가 과다 노출되는 구간
    const extremeRad = (100 * Math.PI) / 180;
    const extreme = solveOculoCephalicLookAt({
      eyePivotWorld: { x: 0, y: 1.6, z: 0 },
      targetWorld: {
        x: Math.sin(extremeRad) * 0.3,
        y: 1.6 + 0.12,
        z: Math.cos(extremeRad) * 0.3,
      },
    });

    expect(extreme.extremeScleraPrevented).toBe(true);
    expect(extreme.eyeEccentricityDeg).toBeLessThanOrEqual(MAX_PHYSIOLOGICAL_EYE_DEG + 1e-6);
    expect(Math.hypot(extreme.leftEye.yawDeg, extreme.leftEye.pitchDeg)).toBeLessThanOrEqual(
      MAX_PHYSIOLOGICAL_EYE_DEG + 1e-6,
    );
    expect(Math.hypot(extreme.rightEye.yawDeg, extreme.rightEye.pitchDeg)).toBeLessThanOrEqual(
      MAX_PHYSIOLOGICAL_EYE_DEG + 1e-6,
    );
    // 안구 상한 초과분이 머리(<= 55°)와 상체(<= 35°)로 재분배되어 100° 수평 시선을 온전히 달성한다.
    expect(extreme.combinedGazeYawDeg).toBeCloseTo(100, 2);
  });

  it("단속성 안구운동(Saccade) 선행 후 두부·상체 지연 추종 및 VOR 안구 역보상 위상을 재현한다", () => {
    const frames = simulateOculoCephalicGazeTrajectory({
      eyePivotWorld: { x: 0, y: 1.6, z: 0 },
      targetWorld: { x: 6, y: 2.1, z: 6 },
      durationMs: 900,
      stepMs: 15,
    });

    const earlyFrame = frames.find((f) => f.timeMs === 45)!;
    const midFrame = frames.find((f) => f.timeMs === 120)!;
    const finalFrame = frames[frames.length - 1]!;

    // 45ms 시점: 머리 시작 지연(50ms) 전이므로 안구가 먼저 빠르게 이동해 양(+)의 위상 선행량을 보인다.
    expect(earlyFrame.headNeck.yawDeg).toBe(0);
    expect(earlyFrame.upperTorso.yawDeg).toBe(0);
    expect(earlyFrame.cyclopeanEye.yawDeg).toBeGreaterThan(15);
    expect(earlyFrame.eyeOverHeadPhaseLeadDeg).toBeGreaterThan(15);

    // 120ms 과도기에도 안구 편심각은 28° 상한을 절대 넘지 않으며, 종단 시점에는 VOR로 약 35% 안정각으로 복귀한다.
    for (const frame of frames) {
      expect(frame.eyeEccentricityDeg).toBeLessThanOrEqual(MAX_PHYSIOLOGICAL_EYE_DEG + 1e-6);
    }
    expect(midFrame.cyclopeanEye.yawDeg).toBeGreaterThan(finalFrame.cyclopeanEye.yawDeg);
    expect(finalFrame.cyclopeanEye.yawDeg).toBeCloseTo(45 * 0.35, 1);
    expect(finalFrame.headNeck.yawDeg).toBeGreaterThan(19);
    expect(finalFrame.upperTorso.yawDeg).toBeGreaterThan(8);
  });
});

describe("Wasm64 Wave 22 Ultragap — 2D 레이어 소실점 바닥 & 꺾인 벽 그림자 및 OPFS 머클 스크러버", () => {
  it("발 접지 오차 0px 바닥 원근 그림자와 수직 벽면 위로 꺾여 올라가는 그림자·거리 비례 반영을 생성한다", () => {
    const foot = { x: 50, y: 90 };
    const light = { x: 10, y: 10, w: 1 };
    const groundVp = { x: 10, y: 98, w: 1 };
    const wallCorner = {
      creaseStart: { x: 68, y: 110 },
      creaseEnd: { x: 86, y: 74 },
    };

    // 발 접지점 표본은 오차 0px로 바닥 자기 위치에 머문다.
    const footHit = projectSilhouetteSampleToShadow(foot, foot, light, groundVp, wallCorner);
    expect(footHit).not.toBeNull();
    expect(footHit!.point.x).toBeCloseTo(50, 5);
    expect(footHit!.point.y).toBeCloseTo(90, 5);
    expect(footHit!.travelDistancePx).toBe(0);

    // 머리 높이 표본은 바닥 모서리를 지나 수직 벽면 위쪽(y < creaseHit.y)으로 꺾여 올라간다.
    const headHitWithWall = projectSilhouetteSampleToShadow(
      { x: 50, y: 38 },
      foot,
      light,
      groundVp,
      wallCorner,
    );
    const headHitNoWall = projectSilhouetteSampleToShadow(
      { x: 50, y: 38 },
      foot,
      light,
      groundVp,
    );
    expect(headHitWithWall?.surface).toBe("wall");
    expect(headHitNoWall?.surface).toBe("ground");
    expect(headHitWithWall!.wallCreaseHit).not.toBeNull();
    expect(headHitWithWall!.point.y).toBeLessThan(headHitWithWall!.wallCreaseHit!.y - 10);
    expect(headHitWithWall!.point.x).toBeCloseTo(headHitWithWall!.wallCreaseHit!.x, 4);

    // 전체 2D 레이어 투영: 바닥 영역(1)과 꺾인 벽 영역(2)이 모두 생성되고 원거리 반영 반경이 발밑보다 넓어진다.
    const width = 120;
    const height = 120;
    const silhouette = new Float32Array(width * height);
    for (let y = 36; y <= 90; y += 1) {
      for (let x = 44; x <= 56; x += 1) {
        silhouette[y * width + x] = 1.0;
      }
    }

    const rendered = projectLayerPerspectiveCastShadow({
      width,
      height,
      silhouetteAlpha: silhouette,
      footBaselineY: 90,
      lightSourcePoint: light,
      groundShadowVanishingPoint: groundVp,
      wallCorner,
      minPenumbraRadiusPx: 0.3,
      penumbraSoftnessPerPx: 0.08,
      maxPenumbraRadiusPx: 8,
    });

    expect(rendered.serverCostKrw).toBe(0);
    expect(rendered.minFootContactGapPx).toBeLessThan(0.6);
    expect(rendered.groundShadowPixelCount).toBeGreaterThan(40);
    expect(rendered.bentWallShadowPixelCount).toBeGreaterThan(25);

    const nearFootRadius = rendered.penumbraRadiusMapPx[90 * width + 50]!;
    const upperWallY = Math.round(headHitWithWall!.point.y);
    const upperWallX = Math.round(headHitWithWall!.point.x);
    const farWallRadius = rendered.penumbraRadiusMapPx[upperWallY * width + upperWallX]!;
    expect(nearFootRadius).toBeLessThan(1.2);
    expect(farWallRadius).toBeGreaterThan(nearFootRadius + 2.0);
  });

  it("평행 태양광(w = 0) 동차 소실점과 벽 모서리 경계 C^0 연속성, S자 변곡점 법선 연속성을 보장한다", () => {
    const foot = { x: 40, y: 100 };
    const parallelLight = { x: 1, y: 1.5, w: 0 };
    const parallelGroundDir = { x: 1, y: 0, w: 0 };
    const verticalCrease = {
      creaseStart: { x: 60, y: 120 },
      creaseEnd: { x: 60, y: 80 },
    };

    // y = 70일 때 바닥 그림자가 정확히 x = 60(모서리)에 도달한다: 40 + (100 - 70)/1.5 = 60
    const justBeforeCrease = projectSilhouetteSampleToShadow(
      { x: 40, y: 70.05 },
      foot,
      parallelLight,
      parallelGroundDir,
      verticalCrease,
    )!;
    const justPastCrease = projectSilhouetteSampleToShadow(
      { x: 40, y: 69.95 },
      foot,
      parallelLight,
      parallelGroundDir,
      verticalCrease,
    )!;
    expect(justBeforeCrease.surface).toBe("ground");
    expect(justPastCrease.surface).toBe("wall");
    expect(Math.hypot(
      justPastCrease.point.x - justBeforeCrease.point.x,
      justPastCrease.point.y - justBeforeCrease.point.y,
    )).toBeLessThan(0.2);

    // S자 변곡점 스플라인에서도 인접 샘플 간 평행 이동 법선 내적이 1에 가까워 180° 비틀림이 없다.
    const sCurveTable = buildGaussLegendreArcLengthTable([
      {
        p0: { x: 0, y: 0 },
        p1: { x: 60, y: 80 },
        p2: { x: 120, y: -80 },
        p3: { x: 180, y: 0 },
      },
    ], 48);
    let prevNormal = sampleSplineAtArcLength(sCurveTable, 0).normal;
    for (let i = 1; i <= 40; i += 1) {
      const frame = sampleSplineAtArcLength(sCurveTable, (sCurveTable.totalArcLength * i) / 40);
      const dot = prevNormal.x * frame.normal.x + prevNormal.y * frame.normal.y;
      expect(dot).toBeGreaterThan(0.95);
      prevNormal = frame.normal;
    }
  });

  it("유휴 틱당 <= 2ms 예산을 엄수하며 비트부패·잘린 쓰기·이중 저널 손상을 머클 트리 + XOR 패리티로 100% 복구한다", () => {
    // FIPS 180-4 SHA-256 표준 벡터 검증 ("abc")
    const abcDigestHex = bytesToHex(sha256Digest(new Uint8Array([0x61, 0x62, 0x63])));
    expect(abcDigestHex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    const originalTiles = Array.from({ length: 8 }, (_, idx) => {
      const bytes = new Uint8Array(256);
      for (let k = 0; k < bytes.byteLength; k += 1) {
        bytes[k] = (idx * 37 + k * 13 + 7) & 0xff;
      }
      return { tileId: `tile-0${idx}`, bytes };
    });

    const volume = createInMemoryOpfsTileVolume(originalTiles);

    // 복합 장애 주입:
    // 1) tile-01: 조용한 1비트 뒤집힘(Silent Bit-Rot)
    volume.corruptPrimaryTileBit("tile-01", 42, 0x20);
    // 2) tile-03: 비정상 종료로 인한 잘린 쓰기(Truncated Write)
    volume.truncatePrimaryTile("tile-03", 91);
    // 3) tile-04: 기본 타일 유실 + 0번 저널 슬롯 손상 (1번 저널 슬롯으로 복구되어야 함)
    volume.deletePrimaryTile("tile-04");
    volume.corruptJournalReplicaBit("tile-04", 0, 17, 0x08);
    // 4) tile-06: 기본 타일 비트부패 + 0번·1번 저널 슬롯 모두 손상 (파트너 tile-07과의 XOR 스트라이프 패리티로 복구)
    volume.corruptPrimaryTileBit("tile-06", 128, 0x55);
    volume.corruptJournalReplicaBit("tile-06", 0, 12, 0x01);
    volume.corruptJournalReplicaBit("tile-06", 1, 99, 0x02);
    // 5) 머클 내부 부모 노드 캐시 오염
    volume.corruptMerkleInternalNode(1, 0);

    // 타일 1개 처리마다 약 0.55ms가 흐르는 결정론적 시계로 <= 2.0ms 유휴 예산 분할을 검증한다.
    let fakeNowMs = 1000;
    const wrappedPort = {
      ...volume,
      readPrimaryTileBytes: (tileId: string) => {
        fakeNowMs += 0.55;
        return volume.readPrimaryTileBytes(tileId);
      },
    };

    const scrubber = createOpfsIdleMerkleScrubber(wrappedPort, {
      defaultIdleBudgetMs: DEFAULT_OPFS_SCRUB_IDLE_BUDGET_MS,
      clockNowMs: () => fakeNowMs,
    });

    const tick1 = scrubber.runIdleTick();
    expect(tick1.budgetMs).toBe(2.0);
    expect(tick1.elapsedMs).toBeLessThanOrEqual(2.0);
    expect(tick1.yieldedForIdleBudget).toBe(true);
    expect(tick1.scannedTileCount).toBe(3);

    // 남은 타일까지 순차 유휴 틱으로 끝까지 스캔한다.
    let totalHealed = tick1.healedTileCount;
    let totalUnrecoverable = tick1.unrecoverableTileCount;
    const sources = new Set(tick1.incidents.map((inc) => inc.recoverySource));

    while (scrubber.getCompletedPasses() < 1) {
      const nextTick = scrubber.runIdleTick();
      expect(nextTick.elapsedMs).toBeLessThanOrEqual(2.0);
      totalHealed += nextTick.healedTileCount;
      totalUnrecoverable += nextTick.unrecoverableTileCount;
      for (const inc of nextTick.incidents) {
        sources.add(inc.recoverySource);
      }
    }

    expect(totalUnrecoverable).toBe(0);
    expect(totalHealed).toBeGreaterThanOrEqual(5);
    expect(sources.has("journal-replica")).toBe(true);
    expect(sources.has("xor-stripe-parity")).toBe(true);
    expect(sources.has("merkle-recompute")).toBe(true);

    // 복구 완료 후 전체 패스를 다시 돌리면 손상 0건·생존율 100%·루트 검증 통과 상태여야 한다.
    const cleanPass = scrubber.runFullVolumeScrub();
    expect(cleanPass.corruptedTileCount).toBe(0);
    expect(cleanPass.unrecoverableTileCount).toBe(0);
    expect(cleanPass.merkleRootVerified).toBe(true);
    expect(cleanPass.dataSurvivalRate).toBe(1);
    expect(cleanPass.serverCostKrw).toBe(0);

    for (const orig of originalTiles) {
      const current = volume.readPrimaryTileBytes(orig.tileId);
      expect(current).not.toBeNull();
      expect(Array.from(current!)).toEqual(Array.from(orig.bytes));
    }
  });
});
