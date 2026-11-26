import { describe, expect, it } from "vitest";

import {
  buildDeepZoomTilePyramid,
  calculatePrintPreflightAndImposition,
  composeDepthOccludedWeatherWetness,
  evaluateCatenaryCurveY,
  FABRIC_MATERIAL_PRESETS,
  fitErgonomicPressureResponseCurve,
  PRINT_PAPER_STOCK_PRESETS,
  solveCatenaryClothFoldGuides,
  solveElasticBalloonTail,
  type RawStylusSample,
} from "./index";

function requireItem<T>(items: readonly T[], index: number, label: string): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`${label}[${index}] 항목이 존재하지 않습니다.`);
  }
  return value;
}

describe("wasm64-wave17-finalcraft: 현수선 옷주름 가이드 · 깊이 차폐 날씨 합성", () => {
  it("어깨·팔꿈치·허리 고정핀에서 정확한 쌍곡선 코사인 현수선 y = a cosh((x - x0)/a) + y0 과 호 길이를 만족한다", () => {
    const anchors = [
      { id: "pin-shoulder", role: "shoulder" as const, position: { x: 10, y: 140 } },
      { id: "pin-elbow", role: "elbow" as const, position: { x: 74, y: 108 }, pinchIntensity: 0.85 },
      { id: "pin-waist", role: "waist" as const, position: { x: 132, y: 92 }, pinchIntensity: 0.7 },
    ];

    const silkReport = solveCatenaryClothFoldGuides({
      anchors,
      fabricPreset: "silk",
      sampleCount: 41,
    });

    expect(silkReport.aiTokensUsed).toBe(0);
    expect(silkReport.serverCostKrw).toBe(0);
    expect(silkReport.catenaryCurves.length).toBeGreaterThanOrEqual(5);

    const primaryCurve = requireItem(silkReport.catenaryCurves, 0, "catenaryCurves");
    expect(primaryCurve.catenaryA).toBeGreaterThan(0);
    expect(primaryCurve.solvedArcLength).toBeCloseTo(primaryCurve.targetArcLength, 7);

    const firstSample = requireItem(primaryCurve.sampledPoints, 0, "sampledPoints");
    const lastSample = requireItem(
      primaryCurve.sampledPoints,
      primaryCurve.sampledPoints.length - 1,
      "sampledPoints",
    );
    expect(firstSample.x).toBeCloseTo(10, 9);
    expect(firstSample.y).toBeCloseTo(140, 8);
    expect(lastSample.x).toBeCloseTo(74, 9);
    expect(lastSample.y).toBeCloseTo(108, 8);

    for (const pt of primaryCurve.sampledPoints) {
      const exactCoshY =
        primaryCurve.catenaryA * Math.cosh((pt.x - primaryCurve.x0) / primaryCurve.catenaryA)
        + primaryCurve.y0;
      expect(pt.y).toBeCloseTo(exactCoshY, 8);
      expect(evaluateCatenaryCurveY(primaryCurve, pt.x)).toBeCloseTo(pt.y, 9);
    }

    // 실크·면·데님·울 코트 물성 비교: 유연한 실크일수록 처짐 깊이와 방사 주름선 수가 크고, 무거운 코트일수록 단위 장력이 높다
    const denimReport = solveCatenaryClothFoldGuides({ anchors, fabricPreset: "denim" });
    const coatReport = solveCatenaryClothFoldGuides({ anchors, fabricPreset: "heavy-coat" });
    const cottonReport = solveCatenaryClothFoldGuides({ anchors, fabricPreset: "cotton" });

    const silkSpan0 = requireItem(silkReport.catenaryCurves, 0, "silk");
    const cottonSpan0 = requireItem(cottonReport.catenaryCurves, 0, "cotton");
    const denimSpan0 = requireItem(denimReport.catenaryCurves, 0, "denim");
    const coatSpan0 = requireItem(coatReport.catenaryCurves, 0, "heavy-coat");

    expect(silkSpan0.sagDepth).toBeGreaterThan(cottonSpan0.sagDepth);
    expect(cottonSpan0.sagDepth).toBeGreaterThan(denimSpan0.sagDepth);
    expect(denimSpan0.sagDepth).toBeGreaterThan(coatSpan0.sagDepth);
    expect(coatSpan0.horizontalTensionNpm).toBeGreaterThan(silkSpan0.horizontalTensionNpm);

    const elbowFansSilk = silkReport.radialTensionFans.filter((f) => f.pinchRole === "elbow");
    const elbowFansDenim = denimReport.radialTensionFans.filter((f) => f.pinchRole === "elbow");
    expect(elbowFansSilk).toHaveLength(FABRIC_MATERIAL_PRESETS.silk.radialFanCount);
    expect(elbowFansDenim).toHaveLength(FABRIC_MATERIAL_PRESETS.denim.radialFanCount);
  });

  it("화면 하향 좌표계(yAxisDirection='down')에서도 아래쪽(+y)으로 자연스럽게 처지는 현수선을 생성한다", () => {
    const downReport = solveCatenaryClothFoldGuides({
      anchors: [
        { id: "s", role: "shoulder", position: { x: 20, y: 50 } },
        { id: "w", role: "waist", position: { x: 120, y: 60 } },
      ],
      fabricPreset: "cotton",
      yAxisDirection: "down",
      spans: [{ fromAnchorId: "s", toAnchorId: "w", slackRatio: 1.16 }],
    });

    const curve = requireItem(downReport.catenaryCurves, 0, "downCurves");
    expect(curve.lowestSagPoint.y).toBeGreaterThan(60);
    const midPt = requireItem(curve.sampledPoints, 16, "midSample");
    expect(evaluateCatenaryCurveY(curve, midPt.x)).toBeCloseTo(midPt.y, 9);
  });

  it("하늘에 열린 상향 표면에만 빗방울·젖은 프레넬 윤기·적설을 입히고 처마·우산 아래는 완전히 건조하게 보존한다", () => {
    const width = 8;
    const height = 4;
    const count = width * height;
    const baseRgba = new Uint8ClampedArray(count * 4);
    const depthBuffer = new Float32Array(count);
    const normalBuffer = new Float32Array(count * 3);
    const worldPositionBuffer = new Float32Array(count * 3);
    const roughnessBuffer = new Float32Array(count);

    // 행별 구역 설계:
    // row 0: 지붕 위 상향 표면 (worldY = 3.2 > bottomY 2.5 -> 하늘 노출)
    // row 1: 지붕 처마 바로 아래 바닥 (worldY = 0.0 < bottomY 2.5, x in [-2, 2] -> 처마 차폐 건조!)
    // row 2: 우산 아래 인물 어깨 (worldY = 1.2 < rimY 1.9, 반경 안 -> 우산 차폐 건조!)
    // row 3: 탁 트인 거리 보도블록 (worldY = 0.0, x in [4, 7] -> 하늘 노출 습윤·적설!)
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const idx = py * width + px;
        baseRgba[idx * 4] = 150;
        baseRgba[idx * 4 + 1] = 142;
        baseRgba[idx * 4 + 2] = 135;
        baseRgba[idx * 4 + 3] = 255;
        depthBuffer[idx] = 5;
        roughnessBuffer[idx] = 0.75;

        normalBuffer[idx * 3] = 0;
        normalBuffer[idx * 3 + 1] = 1;
        normalBuffer[idx * 3 + 2] = 0;

        if (py === 0) {
          worldPositionBuffer[idx * 3] = -1 + px * 0.25;
          worldPositionBuffer[idx * 3 + 1] = 3.2;
          worldPositionBuffer[idx * 3 + 2] = 0;
        } else if (py === 1) {
          worldPositionBuffer[idx * 3] = -1 + px * 0.25;
          worldPositionBuffer[idx * 3 + 1] = 0;
          worldPositionBuffer[idx * 3 + 2] = 0;
        } else if (py === 2) {
          worldPositionBuffer[idx * 3] = 10 + (px - 3.5) * 0.1;
          worldPositionBuffer[idx * 3 + 1] = 1.2;
          worldPositionBuffer[idx * 3 + 2] = 0;
        } else {
          worldPositionBuffer[idx * 3] = 20 + px * 0.31;
          worldPositionBuffer[idx * 3 + 1] = 0;
          worldPositionBuffer[idx * 3 + 2] = px * 0.27;
        }
      }
    }

    const occluders = [
      {
        kind: "roof-eave" as const,
        id: "hanok-eave",
        minX: -2.5,
        maxX: 2.5,
        minZ: -2.5,
        maxZ: 2.5,
        bottomY: 2.5,
        penumbraWidth: 0.02,
      },
      {
        kind: "umbrella" as const,
        id: "hero-umbrella",
        centerX: 10,
        centerZ: 0,
        radius: 0.9,
        rimY: 1.9,
        penumbraWidth: 0.02,
      },
    ];

    const rainResult = composeDepthOccludedWeatherWetness({
      width,
      height,
      baseRgba,
      depthBuffer,
      normalBuffer,
      worldPositionBuffer,
      roughnessBuffer,
      occluders,
      mode: "rain",
      intensity: 0.9,
    });

    expect(rainResult.stats.serverCostKrw).toBe(0);
    expect(rainResult.stats.skyExposedPixelCount).toBe(16);
    expect(rainResult.stats.occludedDryPixelCount).toBe(16);
    expect(rainResult.stats.meanSkyExposedRoughness).toBeLessThan(0.2);
    expect(rainResult.stats.meanOccludedRoughness).toBeCloseTo(0.75, 5);

    // row 1(처마 밑)과 row 2(우산 밑)는 습윤도 0이며 원본 RGBA와 바이트 단위로 일치해야 한다
    for (const shelteredRow of [1, 2]) {
      for (let px = 0; px < width; px += 1) {
        const idx = shelteredRow * width + px;
        expect(rainResult.wetnessMap[idx]).toBe(0);
        expect(rainResult.skyExposureMap[idx]).toBe(0);
        expect(rainResult.compositedRgba[idx * 4]).toBe(150);
        expect(rainResult.compositedRgba[idx * 4 + 1]).toBe(142);
        expect(rainResult.compositedRgba[idx * 4 + 2]).toBe(135);
      }
    }

    // row 0(지붕 위)과 row 3(노출 보도블록)은 젖음 처리되어 거칠기가 낮아져야 한다
    for (const exposedRow of [0, 3]) {
      for (let px = 0; px < width; px += 1) {
        const idx = exposedRow * width + px;
        expect(rainResult.wetnessMap[idx]).toBeGreaterThan(0.8);
        expect(rainResult.effectiveRoughnessMap[idx]).toBeLessThan(0.2);
      }
    }

    // 적설 모드에서 수직 벽면(N_y = 0)은 하늘에 노출되어도 눈이 쌓이지 않아야 한다
    const snowNormals = new Float32Array(normalBuffer);
    for (let px = 0; px < 4; px += 1) {
      const wallIdx = 3 * width + px;
      snowNormals[wallIdx * 3] = 1;
      snowNormals[wallIdx * 3 + 1] = 0;
      snowNormals[wallIdx * 3 + 2] = 0;
    }

    const snowResult = composeDepthOccludedWeatherWetness({
      width,
      height,
      baseRgba,
      depthBuffer,
      normalBuffer: snowNormals,
      worldPositionBuffer,
      occluders,
      mode: "snow",
      intensity: 0.95,
    });

    for (let px = 0; px < width; px += 1) {
      // 처마 밑은 적설 0
      expect(snowResult.snowMask[1 * width + px]).toBe(0);
    }
    for (let px = 0; px < 4; px += 1) {
      // 수직 벽면은 적설 0, 평평한 보도블록(px 4..7)은 적설 발생
      expect(snowResult.snowMask[3 * width + px]).toBe(0);
      expect(snowResult.snowMask[3 * width + px + 4]).toBeGreaterThan(0.75);
    }
  });
});

describe("wasm64-wave17-finalcraft: 인쇄 프리플라이트 · 탄성 말풍선 꼬리 · DeepZoom · 단조 필압 곡선", () => {
  it("국내 단행본 용지 4종 책등 두께 공식, 대첩 접지 크리프, 3mm 도련·5mm 안전선·300DPI 경고를 정확히 검증한다", () => {
    // 아르떼 130g(caliper 0.152mm), 200쪽 무선제본(여유분 0.55mm) -> (200/2)*0.152 + 0.55 = 15.75mm
    const cleanBook = calculatePrintPreflightAndImposition({
      pageCount: 200,
      paperStock: "arte-130g",
      bindingMethod: "perfect-bind",
      trimWidthMm: 148,
      trimHeightMm: 210,
      wingFlapWidthMm: 90,
      bleedMm: 3,
      safetyMarginMm: 5,
      pages: [
        {
          pageNumber: 1,
          artworkCoverageMm: { minXMm: -3, minYMm: -3, maxXMm: 151, maxYMm: 213 },
          criticalItems: [
            {
              itemId: "dlg-hero",
              kind: "balloon-text",
              boundsMm: { minXMm: 12, minYMm: 10, maxXMm: 138, maxYMm: 195 },
            },
          ],
          placedCuts: [
            {
              cutId: "cut-cover-splash",
              pixelWidth: 2000,
              pixelHeight: 2800,
              placedWidthMm: 148,
              placedHeightMm: 210,
            },
          ],
        },
      ],
    });

    expect(cleanBook.spineWidthMm).toBeCloseTo(
      (200 / 2) * PRINT_PAPER_STOCK_PRESETS["arte-130g"].caliperMm + 0.55,
      9,
    );
    expect(cleanBook.fullCoverSpreadWidthMm).toBeCloseTo(6 + 180 + 296 + cleanBook.spineWidthMm, 8);
    expect(cleanBook.preflightPass).toBe(true);
    expect(cleanBook.issues).toHaveLength(0);
    expect(cleanBook.serverCostKrw).toBe(0);

    // 나머지 3개 한국 표준 용지(미색모조 80g, 백상지 100g, 스노우지 120g) 공식 확인
    for (const stockId of ["misaek-mojo-80g", "baeksangji-100g", "snowji-120g"] as const) {
      const r = calculatePrintPreflightAndImposition({
        pageCount: 160,
        paperStock: stockId,
        bindingMethod: "saddle-stitch",
        coverBoardAllowanceMm: 0.3,
      });
      expect(r.spineWidthMm).toBeCloseTo(80 * PRINT_PAPER_STOCK_PRESETS[stockId].caliperMm + 0.3, 9);
    }

    // 중철 16쪽 소책자의 접지 시트별 크리프 및 위반 검출 검사
    const faultyBooklet = calculatePrintPreflightAndImposition({
      pageCount: 16,
      paperStock: "baeksangji-100g",
      bindingMethod: "saddle-stitch",
      trimWidthMm: 148,
      trimHeightMm: 210,
      pages: [
        {
          pageNumber: 1,
          // 우측 도련이 1mm밖에 안 나감 (3mm 기준 위반)
          artworkCoverageMm: { minXMm: -3, minYMm: -3, maxXMm: 149, maxYMm: 213 },
          criticalItems: [
            {
              itemId: "balloon-near-trim",
              kind: "balloon-text",
              // 우측 재단선(148mm)까지 2mm밖에 안 남음 (5mm 안전선 위반)
              boundsMm: { minXMm: 20, minYMm: 20, maxXMm: 146, maxYMm: 60 },
            },
          ],
          placedCuts: [
            {
              cutId: "cut-lowres",
              // 100mm(=3.937in) 폭에 600px -> 약 152.4 DPI (< 300 DPI 경고)
              pixelWidth: 600,
              pixelHeight: 900,
              placedWidthMm: 100,
              placedHeightMm: 150,
            },
          ],
        },
      ],
    });

    expect(faultyBooklet.signatureSheetCreeps).toHaveLength(4);
    const outerSheet = requireItem(faultyBooklet.signatureSheetCreeps, 0, "creeps");
    const innerSheet = requireItem(faultyBooklet.signatureSheetCreeps, 3, "creeps");
    expect(outerSheet.outwardCreepMm).toBe(0);
    expect(outerSheet.folioPages).toEqual([16, 1, 2, 15]);
    expect(innerSheet.outwardCreepMm).toBeCloseTo(3 * 2 * 0.122, 8);
    expect(innerSheet.folioPages).toEqual([10, 7, 8, 9]);

    expect(faultyBooklet.preflightPass).toBe(false);
    const issueKinds = faultyBooklet.issues.map((i) => i.kind);
    expect(issueKinds).toContain("bleed-shortfall");
    expect(issueKinds).toContain("trim-safety-violation");
    expect(issueKinds).toContain("low-dpi-cut");
  });

  it("캐릭터 이동 시 말풍선 꼬리를 화자 입에 고정하고 다른 인물 얼굴 AABB를 매끄럽게 우회한다", () => {
    const balloon = { center: { x: 120, y: 90 }, rx: 70, ry: 44, shape: "ellipse" as const };
    const speakerMouth = { x: 340, y: 290 };
    const bystanderFaceBox = {
      id: "face-bystander-b",
      x: 205,
      y: 165,
      width: 66,
      height: 68,
      paddingPx: 10,
    };

    const routed = solveElasticBalloonTail({
      balloon,
      speakerMouth,
      obstacleKeepOutBoxes: [bystanderFaceBox],
      tipClearancePx: 12,
    });

    expect(routed.avoidedObstacleIds).toContain("face-bystander-b");
    expect(routed.collisionFree).toBe(true);
    expect(routed.anchorDistanceToMouthPx).toBeCloseTo(12, 5);
    expect(routed.svgPathD.startsWith("M ")).toBe(true);

    // 꼬리 뿌리가 타원 경계선 위에 정확히 놓여 있는지 확인
    const normEllipse =
      Math.pow((routed.baseCenter.x - balloon.center.x) / balloon.rx, 2)
      + Math.pow((routed.baseCenter.y - balloon.center.y) / balloon.ry, 2);
    expect(normEllipse).toBeCloseTo(1, 6);

    // 모든 샘플 중심선이 확장된 얼굴 보호 영역 밖으로 우회하는지 확인
    for (const pt of routed.sampledCenterline) {
      const insideExpanded =
        pt.x > bystanderFaceBox.x - 10
        && pt.x < bystanderFaceBox.x + bystanderFaceBox.width + 10
        && pt.y > bystanderFaceBox.y - 10
        && pt.y < bystanderFaceBox.y + bystanderFaceBox.height + 10;
      expect(insideExpanded).toBe(false);
    }

    // 화자가 왼쪽 아래로 이동했을 때도 입 끝 거리 고정과 타원 경계 고정이 유지되어야 한다
    const movedMouth = { x: 55, y: 260 };
    const movedTail = solveElasticBalloonTail({
      balloon,
      speakerMouth: movedMouth,
      tipClearancePx: 10,
    });
    expect(movedTail.collisionFree).toBe(true);
    expect(movedTail.anchorDistanceToMouthPx).toBeCloseTo(10, 5);
  });

  it("초광폭 일러스트를 DeepZoom level 0..L(256x256 + 1px 중첩) 정적 타일 피라미드와 IIIF level0 매니페스트로 내보낸다", () => {
    const width = 600;
    const height = 300;
    const sourceRgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      sourceRgba[i * 4] = i % 251;
      sourceRgba[i * 4 + 1] = (i * 3) % 253;
      sourceRgba[i * 4 + 2] = (i * 7) % 255;
      sourceRgba[i * 4 + 3] = 255;
    }

    const pyramid = buildDeepZoomTilePyramid({
      assetId: "ep12_double_spread",
      width,
      height,
      sourceRgba,
      tileSize: 256,
      overlap: 1,
      format: "webp",
    });

    // ceil(log2(600)) = 10 -> level 0..10 (총 11개 레벨)
    expect(pyramid.maxLevel).toBe(10);
    expect(pyramid.levels).toHaveLength(11);
    expect(pyramid.serverCostKrw).toBe(0);

    const level0 = requireItem(pyramid.levels, 0, "levels");
    const levelMax = requireItem(pyramid.levels, 10, "levels");
    expect(level0.width).toBe(1);
    expect(level0.height).toBe(1);
    expect(level0.tileCount).toBe(1);
    expect(levelMax.width).toBe(600);
    expect(levelMax.height).toBe(300);
    expect(levelMax.columns).toBe(3);
    expect(levelMax.rows).toBe(2);

    const topLevelTiles = pyramid.tiles.filter((t) => t.level === 10);
    expect(topLevelTiles).toHaveLength(6);

    // (0,0): 우측·하단 1px 중첩 -> 257 x 257
    // (1,0): 좌우 각 1px 중첩, 하단 1px 중첩 -> 258 x 257
    // (2,0): 잔여 88px + 좌측 1px 중첩 = 89, 하단 1px 중첩 -> 89 x 257
    const t00 = topLevelTiles.find((t) => t.column === 0 && t.row === 0);
    const t10 = topLevelTiles.find((t) => t.column === 1 && t.row === 0);
    const t20 = topLevelTiles.find((t) => t.column === 2 && t.row === 0);
    expect(t00?.width).toBe(257);
    expect(t00?.height).toBe(257);
    expect(t10?.width).toBe(258);
    expect(t10?.height).toBe(257);
    expect(t20?.width).toBe(89);
    expect(t20?.height).toBe(257);
    expect(t00?.contentHashHex).toHaveLength(8);
    expect(t00?.rgbaPixels?.length).toBe(257 * 257 * 4);

    expect(pyramid.dziXml).toContain('TileSize="256"');
    expect(pyramid.dziXml).toContain('Overlap="1"');
    expect(pyramid.iiifInfo.profile).toBe("level0");
    expect(pyramid.iiifInfo.width).toBe(600);
    expect(JSON.parse(pyramid.iiifInfoJson).type).toBe("ImageService3");
  });

  it("저필압·고필압 작가 히스토그램으로부터 f(0)=0, f(1)=1, f'(p) >= 0 전 구간 단조 베지어 곡선을 피팅한다", () => {
    const lightSamples: RawStylusSample[] = [];
    for (let i = 0; i < 120; i += 1) {
      const u = i / 119;
      // 약한 필압(0.04 ~ 0.50) 위주로 분포하고 빠른 선일수록 필압이 낮아지는 음의 상관 패턴
      const p = 0.04 + 0.46 * Math.pow(u, 1.35);
      const velocity = 900 - 650 * u;
      lightSamples.push({ pressure: p, velocityPxPerSec: velocity });
    }

    const lightFit = fitErgonomicPressureResponseCurve({ samples: lightSamples });
    expect(lightFit.handProfile).toBe("light-handed");
    expect(lightFit.measuredQuantiles.velocityPressureCorrelation).toBeLessThan(-0.8);
    expect(lightFit.evaluate(0)).toBe(0);
    expect(lightFit.evaluate(1)).toBe(1);
    expect(lightFit.estimatedStrainReductionRatio).toBeGreaterThan(0.35);
    expect(lightFit.serverCostKrw).toBe(0);

    // 저필압 작가의 p50 근처에서는 선형 출력보다 훨씬 높은 유효 선폭이 나와야 손가락 부담이 줄어든다
    const p50Light = lightFit.measuredQuantiles.p50;
    const p90Light = lightFit.measuredQuantiles.p90;
    expect(lightFit.evaluate(p50Light)).toBeGreaterThan(p50Light + 0.16);
    expect(lightFit.evaluate(p90Light)).toBeGreaterThan(0.76);

    // 500개 조밀 구간에서 단조 증가 및 비음수 도함수 f'(p) >= 0 전수 검증
    let prevY = 0;
    for (let k = 0; k <= 500; k += 1) {
      const p = k / 500;
      const y = lightFit.evaluate(p);
      const dy = lightFit.evaluateDerivative(p);
      expect(y).toBeGreaterThanOrEqual(prevY - 1e-12);
      expect(dy).toBeGreaterThanOrEqual(0);
      prevY = y;
    }

    // 고필압 작가(히스토그램 입력): 낮은 필압 구간에서 가는 선폭을 확보하도록 완만하게 시작해야 한다
    const heavyFit = fitErgonomicPressureResponseCurve({
      histogramBins: [0, 0, 1, 3, 8, 16, 28, 35, 24, 10],
    });
    expect(heavyFit.handProfile).toBe("heavy-handed");
    expect(heavyFit.evaluate(0)).toBe(0);
    expect(heavyFit.evaluate(1)).toBe(1);
    expect(heavyFit.evaluate(0.35)).toBeLessThan(0.25);

    for (let i = 1; i < heavyFit.lut256.length; i += 1) {
      const prevLut = heavyFit.lut256[i - 1] ?? 0;
      const currLut = heavyFit.lut256[i] ?? 0;
      expect(currLut).toBeGreaterThanOrEqual(prevLut - 1e-7);
    }
  });

  it("거의 수직으로 정렬된 고정핀에서도 수치 발산 없이 유한한 현수선 폴백 곡선을 계산한다", () => {
    const verticalReport = solveCatenaryClothFoldGuides({
      anchors: [
        { id: "collar", role: "collar", position: { x: 100, y: 200 }, isPinchPoint: true },
        { id: "hem", role: "hem", position: { x: 100.0001, y: 80 } },
      ],
      fabricPreset: "heavy-coat",
      sampleCount: 17,
    });

    const curve = requireItem(verticalReport.catenaryCurves, 0, "verticalCurves");
    expect(curve.isNearVerticalFallback).toBe(true);
    expect(Number.isFinite(curve.catenaryA)).toBe(true);
    expect(Number.isFinite(curve.horizontalTensionNpm)).toBe(true);
    for (const sample of curve.sampledPoints) {
      expect(Number.isFinite(sample.x)).toBe(true);
      expect(Number.isFinite(sample.y)).toBe(true);
    }
    expect(verticalReport.radialTensionFans).toHaveLength(3);
  });

  it("횡풍 기울기(windTiltX)와 2.5D 화면 기둥 오버행 차폐가 노출/건조 경계를 정확히 이동시킨다", () => {
    const width = 6;
    const height = 3;
    const count = width * height;
    const baseRgba = new Uint8ClampedArray(count * 4);
    const depthBuffer = new Float32Array(count);
    const normalBuffer = new Float32Array(count * 3);

    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const idx = py * width + px;
        baseRgba[idx * 4] = 120;
        baseRgba[idx * 4 + 1] = 120;
        baseRgba[idx * 4 + 2] = 120;
        baseRgba[idx * 4 + 3] = 255;
        depthBuffer[idx] = 4;
        // row 0의 좌측 절반(px 0..2)은 아래를 향하는 처마 밑면(Ny = -0.8)으로 설정
        normalBuffer[idx * 3] = 0;
        normalBuffer[idx * 3 + 1] = py === 0 && px < 3 ? -0.8 : 1;
        normalBuffer[idx * 3 + 2] = 0;
      }
    }

    const screenColResult = composeDepthOccludedWeatherWetness({
      width,
      height,
      baseRgba,
      depthBuffer,
      normalBuffer,
      enableScreenColumnOcclusion: true,
      screenColumnDepthTolerance: 0.3,
      mode: "sleet",
      intensity: 0.9,
    });

    // 좌측 기둥(px 0..2)의 하단 행(py=2)은 상단 오버행(py=0, Ny=-0.8)에 막혀 건조해야 하고, 우측(px 3..5)은 젖어야 한다
    expect(screenColResult.wetnessMap[2 * width + 1]).toBe(0);
    expect(screenColResult.snowMask[2 * width + 1]).toBe(0);
    expect(screenColResult.wetnessMap[2 * width + 4]).toBeGreaterThan(0.6);
    expect(screenColResult.snowMask[2 * width + 4]).toBeGreaterThan(0.4);
  });

  it("둥근사각형 말풍선·복수 얼굴 장애물 S-우회·초대형 레이아웃 전용 DeepZoom·협대역 필압을 검증한다", () => {
    const multiObstacleTail = solveElasticBalloonTail({
      balloon: { center: { x: 80, y: 80 }, rx: 55, ry: 34, shape: "rounded-rect" },
      speakerMouth: { x: 380, y: 310 },
      obstacleKeepOutBoxes: [
        { id: "face-1", x: 165, y: 120, width: 48, height: 50, paddingPx: 6 },
        { id: "face-2", x: 255, y: 205, width: 50, height: 52, paddingPx: 6 },
      ],
    });
    expect(multiObstacleTail.collisionFree).toBe(true);
    expect(multiObstacleTail.avoidedObstacleIds.length).toBeGreaterThanOrEqual(1);

    // 픽셀 버퍼 할당 없이 16384 x 4096 파노라마 일러스트 타일 레이아웃 계산
    const layoutOnly = buildDeepZoomTilePyramid({
      assetId: "panorama finale!@#",
      width: 16384,
      height: 4096,
      tileSize: 256,
      overlap: 1,
    });
    expect(layoutOnly.assetId).toBe("panorama-finale---");
    expect(layoutOnly.maxLevel).toBe(14);
    expect(layoutOnly.levels).toHaveLength(15);
    expect(requireItem(layoutOnly.tiles, 0, "tiles").rgbaPixels).toBeUndefined();

    // 협대역(narrow-range) 필압 작가 보정 확인
    const narrowFit = fitErgonomicPressureResponseCurve({
      quantiles: { p10: 0.41, p50: 0.5, p90: 0.59, velocityPressureCorrelation: 0.35 },
    });
    expect(narrowFit.handProfile).toBe("narrow-range");
    expect(narrowFit.evaluate(0.59) - narrowFit.evaluate(0.41)).toBeGreaterThan(0.28);
    expect(narrowFit.evaluateDerivative(0.5)).toBeGreaterThan(1);
  });
});
