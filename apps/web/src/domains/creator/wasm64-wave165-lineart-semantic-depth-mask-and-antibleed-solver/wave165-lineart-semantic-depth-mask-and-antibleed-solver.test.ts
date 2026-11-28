import { describe, expect, it } from "vitest";
import {
  DEPTH_MASK_UNIFORM_BYTE_LENGTH,
  DEPTH_MASK_UNIFORM_FLOAT_COUNT,
  SEMANTIC_DEPTH_LAYER_INFO,
  SEMANTIC_DEPTH_LAYER_ORDER,
  WAVE165_ENGINE_ID,
  assertValidLineartRaster,
  assignSemanticDepthMasks,
  auditAntiBleedMaskQuality,
  buildDepthMaskAntiBleedWgsl,
  buildGapSealedInkBarrier,
  computeSemanticMaskFingerprint,
  createSampleLineartDepthScenario,
  escapeSvgXml,
  evaluateNaiveThresholdMask,
  evaluateSingleMaskQuality,
  extractLineartRegions,
  getClassIdForLayer,
  getDepthRankForClass,
  getLayerForClassId,
  renderSemanticMaskAuditSvg,
  runLineartSemanticDepthMaskSolver,
  sha256MaskHex,
  solveAntiBleedDepthMasks,
  summarizeSemanticMaskAuditKo,
  validateDepthMaskAntiBleedWgsl,
  type AntiBleedMaskSolution,
  type DepthMaskWgslBundle,
  type LineartRasterInput,
  type SemanticSeedHint,
} from "./index";

function createBlankRaster(width: number, height: number): LineartRasterInput {
  return { width, height, inkAlpha: new Uint8Array(width * height) };
}

function drawRectBorder(
  ink: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  alpha = 255,
): void {
  for (let x = x0; x <= x1; x += 1) {
    ink[y0 * width + x] = Math.max(ink[y0 * width + x], alpha);
    ink[y1 * width + x] = Math.max(ink[y1 * width + x], alpha);
  }
  for (let y = y0; y <= y1; y += 1) {
    ink[y * width + x0] = Math.max(ink[y * width + x0], alpha);
    ink[y * width + x1] = Math.max(ink[y * width + x1], alpha);
  }
}

describe("Wave 165: 2D 라인아트 시맨틱 깊이 마스크 & 안티-블리드 솔버", () => {
  describe("1. 도메인 메타데이터 및 입력 유효성 검증", () => {
    it("6개 시맨틱 깊이 클래스가 전경에서 배경 순으로 단조 감소하는 정수 순위를 가진다", () => {
      expect(SEMANTIC_DEPTH_LAYER_ORDER).toHaveLength(6);
      for (let i = 1; i < SEMANTIC_DEPTH_LAYER_ORDER.length; i += 1) {
        expect(getDepthRankForClass(SEMANTIC_DEPTH_LAYER_ORDER[i - 1])).toBeGreaterThan(
          getDepthRankForClass(SEMANTIC_DEPTH_LAYER_ORDER[i]),
        );
      }
      expect(getLayerForClassId(getClassIdForLayer("character-hair"))).toBe("character-hair");
      expect(getLayerForClassId(99)).toBeNull();
    });

    it("모든 시맨틱 깊이 레이어 스와치가 순수 OKLCH 색표기만 사용한다", () => {
      for (const cls of SEMANTIC_DEPTH_LAYER_ORDER) {
        const info = SEMANTIC_DEPTH_LAYER_INFO[cls];
        expect(info.oklchFill).toMatch(/^oklch\(/);
        expect(info.oklchStroke).toMatch(/^oklch\(/);
        expect(info.oklchFill).not.toMatch(/#|rgb\(|hsl\(/i);
      }
    });

    it("잘못된 래스터 크기나 버퍼 길이는 RangeError로 거부한다", () => {
      expect(() =>
        assertValidLineartRaster({ width: 0, height: 16, inkAlpha: new Uint8Array(0) }),
      ).toThrow(RangeError);
      expect(() =>
        assertValidLineartRaster({ width: 8, height: 8, inkAlpha: new Uint8Array(10) }),
      ).toThrow(RangeError);
    });
  });

  describe("2. 열린 펜선 틈 봉합(Gap-Closing) 및 누수 차단", () => {
    it("의도적 2px 틈이 있는 캐릭터 얼굴은 미봉합(maxGapClosePx=0) 시 배경으로 누수된다", () => {
      const sc = createSampleLineartDepthScenario({ includeDeliberatePenGap: true, gapHeightPx: 2, maxGapClosePx: 0 });
      const unsealed = buildGapSealedInkBarrier(sc.raster, { maxGapClosePx: 0 });
      expect(unsealed.bridgePixelCount).toBe(0);
      const extraction = extractLineartRegions(unsealed.sealedBarrierMask, sc.raster.width, sc.raster.height);
      const assignment = assignSemanticDepthMasks(extraction, sc.seeds);
      expect(assignment.leakedRegionCount).toBeGreaterThan(0);
      expect(assignment.seedCollisionCount).toBeGreaterThan(0);
    });

    it("buildGapSealedInkBarrier가 2px 틈을 봉합하면 캐릭터 얼굴과 배경이 완전히 격리된다(leakedRegionCount=0)", () => {
      const sc = createSampleLineartDepthScenario({ includeDeliberatePenGap: true, gapHeightPx: 2, maxGapClosePx: 3 });
      const barrier = buildGapSealedInkBarrier(sc.raster, sc.segmentationOptions);
      expect(barrier.closedGapCount).toBeGreaterThanOrEqual(1);
      expect(barrier.bridgePixelCount).toBeGreaterThan(0);
      expect(barrier.thickeningRatio).toBeLessThan(0.05);

      const extraction = extractLineartRegions(barrier.sealedBarrierMask, sc.raster.width, sc.raster.height);
      const assignment = assignSemanticDepthMasks(extraction, sc.seeds);
      expect(assignment.leakedRegionCount).toBe(0);
      expect(assignment.seedCollisionCount).toBe(0);
      expect(assignment.perClassPixelCounts["character-face"]).toBeGreaterThan(150);
      expect(assignment.perClassPixelCounts["background-sky"]).toBeGreaterThan(1000);
    });

    it("완전히 닫힌 사각 윤곽선에서는 불필요한 선화 굵어짐(bridgePixelCount=0)이 발생하지 않는다", () => {
      const raster = createBlankRaster(32, 32);
      drawRectBorder(raster.inkAlpha, 32, 8, 8, 23, 23, 255);
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 3 });
      expect(barrier.bridgePixelCount).toBe(0);
      expect(barrier.closedGapCount).toBe(0);
    });

    it("2px 간격으로 나란히 달리는 평행선 사이는 틈으로 오인해 메우지 않는다", () => {
      const raster = createBlankRaster(32, 20);
      for (let x = 4; x <= 27; x += 1) {
        raster.inkAlpha[6 * 32 + x] = 255;
        raster.inkAlpha[7 * 32 + x] = 255;
        raster.inkAlpha[10 * 32 + x] = 255;
        raster.inkAlpha[11 * 32 + x] = 255;
      }
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 3 });
      for (let x = 8; x <= 23; x += 1) {
        expect(barrier.sealedBarrierMask[8 * 32 + x]).toBe(0);
        expect(barrier.sealedBarrierMask[9 * 32 + x]).toBe(0);
      }
    });

    it("T-자 접합부에서 2px 모자라게 멈춘 펜선 언더슛을 정확히 이어 영역을 닫는다", () => {
      const raster = createBlankRaster(28, 28);
      drawRectBorder(raster.inkAlpha, 28, 4, 4, 23, 23, 255);
      for (let x = 4; x <= 20; x += 1) {
        raster.inkAlpha[14 * 28 + x] = 255;
      }
      const unsealed = extractLineartRegions(
        buildGapSealedInkBarrier(raster, { maxGapClosePx: 0 }).sealedBarrierMask,
        28,
        28,
      );
      const sealed = extractLineartRegions(
        buildGapSealedInkBarrier(raster, { maxGapClosePx: 3 }).sealedBarrierMask,
        28,
        28,
      );
      expect(unsealed.regionCount).toBe(2);
      expect(sealed.regionCount).toBe(3);
    });

    it("대각선 방향 2px 끊김도 봉합해 내부 영역을 분리한다", () => {
      const raster = createBlankRaster(30, 30);
      drawRectBorder(raster.inkAlpha, 30, 5, 5, 24, 24, 255);
      for (let i = 5; i <= 24; i += 1) {
        if (i !== 14 && i !== 15) raster.inkAlpha[i * 30 + i] = 255;
      }
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 3 });
      const extraction = extractLineartRegions(barrier.sealedBarrierMask, 30, 30);
      expect(barrier.bridgePixelCount).toBeGreaterThanOrEqual(2);
      expect(extraction.regionCount).toBe(3);
    });

    it("허용 한계(maxGapClosePx=2)를 넘는 4px 넓은 개구부는 억지로 닫지 않는다", () => {
      const raster = createBlankRaster(28, 28);
      drawRectBorder(raster.inkAlpha, 28, 6, 6, 21, 21, 255);
      for (let y = 12; y <= 15; y += 1) {
        raster.inkAlpha[y * 28 + 21] = 0;
      }
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 2 });
      expect(extractLineartRegions(barrier.sealedBarrierMask, 28, 28).regionCount).toBe(1);
    });
  });

  describe("3. 4-연결 영역 추출, 인접 그래프 및 시맨틱 깊이 할당", () => {
    it("추출된 영역의 경계 상자·무게중심·대칭 인접 그래프가 일관된다", () => {
      const scenario = createSampleLineartDepthScenario();
      const barrier = buildGapSealedInkBarrier(scenario.raster, scenario.segmentationOptions);
      const extraction = extractLineartRegions(
        barrier.sealedBarrierMask,
        scenario.raster.width,
        scenario.raster.height,
      );
      expect(extraction.regionCount).toBeGreaterThanOrEqual(7);
      for (const reg of extraction.regions) {
        expect(reg.pixelCount).toBeGreaterThan(0);
        expect(reg.bbox.minX).toBeLessThanOrEqual(reg.bbox.maxX);
        expect(reg.bbox.minY).toBeLessThanOrEqual(reg.bbox.maxY);
        expect(reg.centroid.x).toBeGreaterThanOrEqual(reg.bbox.minX);
        expect(reg.centroid.x).toBeLessThanOrEqual(reg.bbox.maxX);
        for (const nid of reg.neighborRegionIds) {
          expect(extraction.adjacency[nid]).toContain(reg.regionId);
        }
      }
    });

    it("시드가 없는 닫힌 머리카락 소영역이 고아로 남지 않고 캐릭터 헤어로 자동 귀속된다", () => {
      const scenario = createSampleLineartDepthScenario();
      const barrier = buildGapSealedInkBarrier(scenario.raster, scenario.segmentationOptions);
      const extraction = extractLineartRegions(
        barrier.sealedBarrierMask,
        scenario.raster.width,
        scenario.raster.height,
      );
      const assignment = assignSemanticDepthMasks(
        extraction,
        scenario.seeds,
        scenario.segmentationOptions,
      );
      expect(assignment.resolvedMicroRegionCount).toBeGreaterThanOrEqual(1);
      expect(assignment.orphanedRegionCount).toBe(0);
      expect(getLayerForClassId(assignment.coreLayerMap[18 * 64 + 38])).toBe("character-hair");
      const enclosed = assignment.assignments.find(
        (entry) => entry.assignmentSource === "enclosure-neighbor",
      );
      expect(enclosed?.layerClass).toBe("character-hair");
    });

    it("하단 테두리 1면만 닿은 반신 캐릭터 의상은 누수로 오탐하지 않는다", () => {
      const raster = createBlankRaster(32, 32);
      for (let x = 10; x <= 22; x += 1) raster.inkAlpha[18 * 32 + x] = 255;
      for (let y = 18; y <= 31; y += 1) {
        raster.inkAlpha[y * 32 + 10] = 255;
        raster.inkAlpha[y * 32 + 22] = 255;
      }
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 2 });
      const extraction = extractLineartRegions(barrier.sealedBarrierMask, 32, 32);
      const seeds: readonly SemanticSeedHint[] = [
        { x: 2, y: 2, layerClass: "background-sky", labelKo: "하늘" },
        { x: 16, y: 25, layerClass: "character-outfit", labelKo: "반신 상의" },
      ];
      const assignment = assignSemanticDepthMasks(extraction, seeds);
      expect(assignment.leakedRegionCount).toBe(0);
      expect(assignment.seedCollisionCount).toBe(0);
      expect(getLayerForClassId(assignment.coreLayerMap[25 * 32 + 16])).toBe("character-outfit");
    });

    it("선화 픽셀 바로 위에 찍힌 시드도 반경 2px 내 열린 영역을 안전하게 찾는다", () => {
      const raster = createBlankRaster(24, 24);
      drawRectBorder(raster.inkAlpha, 24, 6, 6, 17, 17, 255);
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 2 });
      const extraction = extractLineartRegions(barrier.sealedBarrierMask, 24, 24);
      const assignment = assignSemanticDepthMasks(extraction, [
        { x: 6, y: 6, layerClass: "foreground-prop", labelKo: "선 위 시드" },
      ]);
      expect(assignment.perClassPixelCounts["foreground-prop"]).toBeGreaterThan(0);
    });

    it("배경 시드 없이 전경 시드만 있는 경우 열린 틈으로 캔버스 4변을 감싸면 누수로 감지한다", () => {
      const raster = createBlankRaster(28, 28);
      drawRectBorder(raster.inkAlpha, 28, 8, 8, 19, 19, 255);
      raster.inkAlpha[13 * 28 + 19] = 0;
      raster.inkAlpha[14 * 28 + 19] = 0;
      const unsealed = buildGapSealedInkBarrier(raster, { maxGapClosePx: 0 });
      const extraction = extractLineartRegions(unsealed.sealedBarrierMask, 28, 28);
      const assignment = assignSemanticDepthMasks(extraction, [
        { x: 13, y: 13, layerClass: "character-face", labelKo: "얼굴" },
      ]);
      expect(assignment.leakedRegionCount).toBe(1);
    });

    it("extractLineartRegions가 잘못된 크기 입력 시 RangeError를 던진다", () => {
      expect(() => extractLineartRegions(new Uint8Array(4), 0, 2)).toThrow(RangeError);
      expect(() => extractLineartRegions(new Uint8Array(4), 3, 3)).toThrow(RangeError);
    });
  });

  describe("4. 흰 테두리(White Halo) 제거 및 교차 레이어 안티-블리드 검증", () => {
    it("나이브 임계치 채우기는 반투명 선화 경계에 흰 테두리(whiteHaloPixelCount > 0)를 남긴다", () => {
      const sc = createSampleLineartDepthScenario();
      const barrier = buildGapSealedInkBarrier(sc.raster, sc.segmentationOptions);
      const extraction = extractLineartRegions(barrier.sealedBarrierMask, sc.raster.width, sc.raster.height);
      const assignment = assignSemanticDepthMasks(extraction, sc.seeds, sc.segmentationOptions);
      const naive = evaluateNaiveThresholdMask(sc.raster, assignment);
      const solved = solveAntiBleedDepthMasks(sc.raster, barrier, assignment, sc.antiBleedOptions);
      const audit = auditAntiBleedMaskQuality(sc.raster, assignment, naive, solved, sc.antiBleedOptions);

      expect(audit.naiveMetrics.whiteHaloPixelCount).toBeGreaterThan(100);
      expect(audit.solvedMetrics.whiteHaloPixelCount).toBe(0);
      expect(audit.haloReductionRatio).toBe(1);
      expect(audit.haloEliminatedPixels).toBe(audit.naiveMetrics.whiteHaloPixelCount);
    });

    it("서브-잉크 안티-블리드 솔버는 선화 반대편으로 색 번짐 없이(crossLayerBleedCount=0) 확장된다", () => {
      const result = runLineartSemanticDepthMaskSolver(createSampleLineartDepthScenario());
      expect(result.audit.solvedMetrics.crossLayerBleedCount).toBe(0);
      expect(result.audit.zeroBleedGuaranteed).toBe(true);
      expect(result.audit.zeroLeakGuaranteed).toBe(true);
      expect(result.solvedSolution.underInkFilledPixelCount).toBeGreaterThan(200);
      expect(result.audit.solvedMetrics.coverageRatio).toBe(1);
    });

    it("1px 공유 외곽선 아래에서는 전경 깊이(헤어 > 얼굴 > 배경)가 결정론적으로 승리한다", () => {
      const width = 21;
      const height = 11;
      const raster = createBlankRaster(width, height);
      for (let y = 0; y < height; y += 1) {
        raster.inkAlpha[y * width + 7] = 180;
        raster.inkAlpha[y * width + 14] = 180;
      }
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 0 });
      const extraction = extractLineartRegions(barrier.sealedBarrierMask, width, height);
      const assignment = assignSemanticDepthMasks(extraction, [
        { x: 3, y: 5, layerClass: "character-hair", labelKo: "헤어" },
        { x: 10, y: 5, layerClass: "character-face", labelKo: "얼굴" },
        { x: 17, y: 5, layerClass: "background-sky", labelKo: "배경" },
      ]);
      const solved = solveAntiBleedDepthMasks(raster, barrier, assignment);

      expect(getLayerForClassId(solved.resolvedLayerMap[5 * width + 7])).toBe("character-hair");
      expect(getLayerForClassId(solved.resolvedLayerMap[5 * width + 14])).toBe("character-face");
      expect(getLayerForClassId(solved.resolvedLayerMap[5 * width + 6])).toBe("character-hair");
      expect(getLayerForClassId(solved.resolvedLayerMap[5 * width + 8])).toBe("character-face");
      expect(getLayerForClassId(solved.resolvedLayerMap[5 * width + 15])).toBe("background-sky");

      const metrics = evaluateSingleMaskQuality(raster, assignment, solved);
      expect(metrics.whiteHaloPixelCount).toBe(0);
      expect(metrics.crossLayerBleedCount).toBe(0);
    });

    it("3px 두꺼운 선화에서는 양쪽 반투명 가장자리가 자기 영역 색을 유지하고 중앙만 전경이 점유한다", () => {
      const width = 23;
      const height = 9;
      const raster = createBlankRaster(width, height);
      for (let y = 0; y < height; y += 1) {
        raster.inkAlpha[y * width + 10] = 170;
        raster.inkAlpha[y * width + 11] = 255;
        raster.inkAlpha[y * width + 12] = 170;
      }
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 0 });
      const extraction = extractLineartRegions(barrier.sealedBarrierMask, width, height);
      const assignment = assignSemanticDepthMasks(extraction, [
        { x: 4, y: 4, layerClass: "character-hair", labelKo: "헤어" },
        { x: 18, y: 4, layerClass: "character-face", labelKo: "얼굴" },
      ]);
      const solved = solveAntiBleedDepthMasks(raster, barrier, assignment);

      expect(getLayerForClassId(solved.resolvedLayerMap[4 * width + 10])).toBe("character-hair");
      expect(getLayerForClassId(solved.resolvedLayerMap[4 * width + 11])).toBe("character-hair");
      expect(getLayerForClassId(solved.resolvedLayerMap[4 * width + 12])).toBe("character-face");

      const metrics = evaluateSingleMaskQuality(raster, assignment, solved);
      expect(metrics.whiteHaloPixelCount).toBe(0);
      expect(metrics.crossLayerBleedCount).toBe(0);
    });

    it("열린 영역으로 과다 팽창된 불량 마스크는 crossLayerBleedCount > 0으로 적발한다", () => {
      const scenario = createSampleLineartDepthScenario();
      const barrier = buildGapSealedInkBarrier(scenario.raster, scenario.segmentationOptions);
      const extraction = extractLineartRegions(
        barrier.sealedBarrierMask,
        scenario.raster.width,
        scenario.raster.height,
      );
      const assignment = assignSemanticDepthMasks(extraction, scenario.seeds);
      const solved = solveAntiBleedDepthMasks(scenario.raster, barrier, assignment);

      const corruptedMap = new Uint8Array(solved.resolvedLayerMap);
      corruptedMap[33 * 64 + 32] = getClassIdForLayer("character-hair");
      corruptedMap[34 * 64 + 32] = getClassIdForLayer("character-hair");
      const corrupted: AntiBleedMaskSolution = { ...solved, resolvedLayerMap: corruptedMap };
      const naive = evaluateNaiveThresholdMask(scenario.raster, assignment);
      const audit = auditAntiBleedMaskQuality(scenario.raster, assignment, naive, corrupted);

      expect(audit.solvedMetrics.crossLayerBleedCount).toBeGreaterThanOrEqual(2);
      expect(audit.zeroBleedGuaranteed).toBe(false);
      expect(audit.status).toBe("FAIL");
    });

    it("상대 영역의 반투명 선화 가장자리를 침범한 불량 마스크도 crossLayerBleedCount로 적발한다", () => {
      const width = 23;
      const height = 9;
      const raster = createBlankRaster(width, height);
      for (let y = 0; y < height; y += 1) {
        raster.inkAlpha[y * width + 10] = 170;
        raster.inkAlpha[y * width + 11] = 255;
        raster.inkAlpha[y * width + 12] = 170;
      }
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 0 });
      const extraction = extractLineartRegions(barrier.sealedBarrierMask, width, height);
      const assignment = assignSemanticDepthMasks(extraction, [
        { x: 4, y: 4, layerClass: "character-hair", labelKo: "헤어" },
        { x: 18, y: 4, layerClass: "character-face", labelKo: "얼굴" },
      ]);
      const solved = solveAntiBleedDepthMasks(raster, barrier, assignment);
      const badMap = new Uint8Array(solved.resolvedLayerMap);
      badMap[4 * width + 12] = getClassIdForLayer("character-hair");
      const badMetrics = evaluateSingleMaskQuality(raster, assignment, {
        ...solved,
        resolvedLayerMap: badMap,
      });
      expect(badMetrics.crossLayerBleedCount).toBe(1);
    });

    it("45도 대각선 안티앨리어싱 선화에서도 대각 이웃 폴백으로 흰 테두리를 0px로 제거한다", () => {
      const size = 20;
      const raster = createBlankRaster(size, size);
      for (let i = 0; i < size; i += 1) {
        raster.inkAlpha[i * size + i] = 190;
        if (i + 1 < size) raster.inkAlpha[i * size + (i + 1)] = 150;
      }
      const barrier = buildGapSealedInkBarrier(raster, { maxGapClosePx: 0 });
      const extraction = extractLineartRegions(barrier.sealedBarrierMask, size, size);
      const assignment = assignSemanticDepthMasks(extraction, [
        { x: 15, y: 3, layerClass: "character-hair", labelKo: "상단" },
        { x: 3, y: 15, layerClass: "character-face", labelKo: "하단" },
      ]);
      const naive = evaluateNaiveThresholdMask(raster, assignment);
      const solved = solveAntiBleedDepthMasks(raster, barrier, assignment);
      const audit = auditAntiBleedMaskQuality(raster, assignment, naive, solved);
      expect(audit.naiveMetrics.whiteHaloPixelCount).toBeGreaterThan(20);
      expect(audit.solvedMetrics.whiteHaloPixelCount).toBe(0);
      expect(audit.solvedMetrics.crossLayerBleedCount).toBe(0);
    });

    it("레이어별 클리핑 마스크 목록이 전경에서 배경 순으로 정렬되고 합계가 전체 픽셀과 일치한다", () => {
      const result = runLineartSemanticDepthMaskSolver(createSampleLineartDepthScenario());
      const masks = result.solvedSolution.layerMasks;
      expect(masks).toHaveLength(6);
      expect(masks[0].layerClass).toBe("foreground-prop");
      expect(masks[5].layerClass).toBe("background-sky");

      let sumMasked = 0;
      for (const mask of masks) {
        expect(mask.totalMaskedPixelCount).toBe(
          mask.corePixelCount + mask.underInkExpandedPixelCount,
        );
        sumMasked += mask.totalMaskedPixelCount;
      }
      expect(sumMasked).toBe(64 * 64);
    });
  });

  describe("5. 64-byte WGSL 프래그먼트 셰이더 및 정적 계약 검증기", () => {
    it("정상 64-byte WGSL 번들이 모든 정적 검증을 통과한다", () => {
      const bundle = buildDepthMaskAntiBleedWgsl({ canvasWidth: 64, canvasHeight: 64 });
      expect(bundle.uniformByteLength).toBe(DEPTH_MASK_UNIFORM_BYTE_LENGTH);
      expect(bundle.uniformFloats).toHaveLength(DEPTH_MASK_UNIFORM_FLOAT_COUNT);
      expect(bundle.uniformByteLength % 16).toBe(0);

      const validation = validateDepthMaskAntiBleedWgsl(bundle);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.braceDepthBalance).toBe(0);
      expect(validation.bindingKeys).toEqual(["g0:b0", "g0:b1", "g0:b2", "g0:b3", "g0:b4"]);
    });

    it("닫히지 않은 중괄호가 있으면 정적 검증이 실패한다", () => {
      const bundle = buildDepthMaskAntiBleedWgsl({ canvasWidth: 64, canvasHeight: 64 });
      const validation = validateDepthMaskAntiBleedWgsl({
        ...bundle,
        wgslSource: `${bundle.wgslSource}\nfn broken() {`,
      });
      expect(validation.valid).toBe(false);
      expect(validation.braceDepthBalance).toBe(1);
    });

    it("중복 @group/@binding 선언을 거부한다", () => {
      const bundle = buildDepthMaskAntiBleedWgsl({ canvasWidth: 64, canvasHeight: 64 });
      const validation = validateDepthMaskAntiBleedWgsl({
        ...bundle,
        wgslSource: bundle.wgslSource.replace("@binding(2)", "@binding(1)"),
      });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("중복된 바인딩"))).toBe(true);
    });

    it("16바이트 정렬에 어긋난 유니폼 크기를 거부한다", () => {
      const bundle = buildDepthMaskAntiBleedWgsl({ canvasWidth: 64, canvasHeight: 64 });
      const validation = validateDepthMaskAntiBleedWgsl({
        ...bundle,
        uniformByteLength: 52,
        uniformFloats: new Float32Array(13),
      });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("16바이트"))).toBe(true);
    });

    it("GLSL 금지 토큰(texture2D, gl_FragCoord, untyped vec4/vec2/vec3)을 모두 거부한다", () => {
      const base = buildDepthMaskAntiBleedWgsl({ canvasWidth: 64, canvasHeight: 64 });
      const snippets = [
        "let x = texture2D(tex, uv);",
        "let p = gl_FragCoord.xy;",
        "let c = vec4(1.0, 0.0, 0.0, 1.0);",
        "let v = vec2(0.5, 0.5);",
        "let k = vec3(1.0, 1.0, 1.0);",
      ];
      for (const snippet of snippets) {
        const mutated: DepthMaskWgslBundle = {
          ...base,
          wgslSource: `${base.wgslSource}\n// ${snippet}`,
        };
        const validation = validateDepthMaskAntiBleedWgsl(mutated);
        expect(validation.valid).toBe(false);
        expect(validation.errors.some((e) => e.includes("GLSL"))).toBe(true);
      }
    });

    it("NaN 또는 Infinity 유니폼 값을 거부한다", () => {
      expect(
        validateDepthMaskAntiBleedWgsl(
          buildDepthMaskAntiBleedWgsl({ canvasWidth: 64, canvasHeight: 64, chokeBiasPx: Number.NaN }),
        ).valid,
      ).toBe(false);
      expect(
        validateDepthMaskAntiBleedWgsl(
          buildDepthMaskAntiBleedWgsl({
            canvasWidth: 64,
            canvasHeight: 64,
            inkOpacityGain: Number.POSITIVE_INFINITY,
          }),
        ).valid,
      ).toBe(false);
    });

    it("@fragment 진입점이 누락되면 검증에 실패한다", () => {
      const base = buildDepthMaskAntiBleedWgsl({ canvasWidth: 64, canvasHeight: 64 });
      const validation = validateDepthMaskAntiBleedWgsl({
        ...base,
        wgslSource: base.wgslSource.replace("@fragment", ""),
      });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("@fragment"))).toBe(true);
    });

    it("유니폼 캔버스 크기가 0 이하이면 검증에 실패한다", () => {
      const validation = validateDepthMaskAntiBleedWgsl(
        buildDepthMaskAntiBleedWgsl({ canvasWidth: 0, canvasHeight: 64 }),
      );
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("캔버스 크기"))).toBe(true);
    });
  });

  describe("6. FIPS 180-4 SHA-256 표준 벡터 및 지문 결정성", () => {
    it("빈 문자열('')과 'abc' 표준 FIPS 180-4 SHA-256 벡터가 정확히 일치한다", () => {
      expect(sha256MaskHex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256MaskHex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });

    it("한글 UTF-8 멀티바이트 입력과 Uint8Array 입력을 일관되게 해시한다", () => {
      const h1 = sha256MaskHex("웹툰 라인아트 안티블리드");
      expect(h1).toHaveLength(64);
      expect(h1).toBe(sha256MaskHex("웹툰 라인아트 안티블리드"));
      expect(sha256MaskHex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });

    it("동일 시나리오는 동일 지문을 내고 잉크 1픽셀 또는 시드 1건만 바뀌어도 지문이 달라진다", () => {
      const baseScenario = createSampleLineartDepthScenario();
      const r1 = runLineartSemanticDepthMaskSolver(baseScenario);
      const r2 = runLineartSemanticDepthMaskSolver(createSampleLineartDepthScenario());
      expect(r1.fingerprintSha256).toBe(r2.fingerprintSha256);
      expect(r1.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);

      const mutatedInk = new Uint8Array(baseScenario.raster.inkAlpha);
      mutatedInk[2 * 64 + 2] = 12;
      const rInk = runLineartSemanticDepthMaskSolver({
        ...baseScenario,
        raster: { ...baseScenario.raster, inkAlpha: mutatedInk },
      });
      expect(rInk.fingerprintSha256).not.toBe(r1.fingerprintSha256);

      const mutatedSeeds = baseScenario.seeds.map((s, idx) =>
        idx === 0 ? { ...s, x: s.x + 1 } : s,
      );
      const rSeed = runLineartSemanticDepthMaskSolver({ ...baseScenario, seeds: mutatedSeeds });
      expect(rSeed.fingerprintSha256).not.toBe(r1.fingerprintSha256);
    });

    it("시드 순서가 달라져도 정규화 정렬 덕분에 지문이 동일하다", () => {
      const scenario = createSampleLineartDepthScenario();
      const r1 = runLineartSemanticDepthMaskSolver(scenario);
      const r2 = runLineartSemanticDepthMaskSolver({
        ...scenario,
        seeds: [...scenario.seeds].reverse(),
      });
      expect(r1.fingerprintSha256).toBe(r2.fingerprintSha256);
    });

    it("computeSemanticMaskFingerprint를 직접 호출해도 64자 16진수를 반환한다", () => {
      const scenario = createSampleLineartDepthScenario();
      const res = runLineartSemanticDepthMaskSolver(scenario);
      expect(
        computeSemanticMaskFingerprint(
          scenario.raster,
          scenario.seeds,
          res.assignment,
          res.solvedSolution,
          res.audit,
        ),
      ).toBe(res.fingerprintSha256);
    });
  });

  describe("7. 순수 OKLCH 진단 SVG 및 채색 디렉터 한국어 QA 요약", () => {
    it("진단 SVG가 순수 oklch()만 포함하고 원시 hex/rgb/hsl 및 NaN/Infinity가 전혀 없다", () => {
      const res = runLineartSemanticDepthMaskSolver(createSampleLineartDepthScenario());
      expect(res.auditSvg).toContain("<svg");
      expect(res.auditSvg).toContain("</svg>");
      expect(res.auditSvg).toContain("oklch(");
      expect(res.auditSvg).not.toMatch(/#|rgb\(|hsl\(/i);
      expect(res.auditSvg).not.toContain("NaN");
      expect(res.auditSvg).not.toContain("Infinity");
      expect(res.auditSvg).toContain("PASS");
    });

    it("제목에 특수문자가 들어가도 XML 이스케이프로 안전하게 렌더링한다", () => {
      const base = createSampleLineartDepthScenario();
      const res = runLineartSemanticDepthMaskSolver(base);
      const svg = renderSemanticMaskAuditSvg({
        titleKo: `1화 <검수> & "빛" '테스트'`,
        raster: base.raster,
        barrier: res.barrier,
        solvedSolution: res.solvedSolution,
        audit: res.audit,
      });
      expect(escapeSvgXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
      expect(svg).toContain("&lt;검수&gt;");
      expect(svg).toContain("&amp;");
      expect(svg).toContain("&quot;빛&quot;");
      expect(svg).toContain("&apos;테스트&apos;");
      expect(svg).not.toMatch(/#/);
    });

    it("한국어 QA 요약이 PASS/WARN/FAIL 상태별로 자연스러운 실무 안내를 출력한다", () => {
      const passRes = runLineartSemanticDepthMaskSolver(createSampleLineartDepthScenario());
      expect(passRes.summaryKo).toContain("[PASS]");
      expect(passRes.summaryKo).toContain("밑색 채색 팀에 바로 넘겨도 되는");
      expect(passRes.summaryKo).not.toMatch(/가능하게 합니다|직관적인 경험을 제공|원활한 워크플로우를 보장/);

      const warnSummary = summarizeSemanticMaskAuditKo({
        titleKo: "경고 시나리오",
        barrier: passRes.barrier,
        extraction: passRes.extraction,
        assignment: passRes.assignment,
        audit: {
          ...passRes.audit,
          status: "WARN",
          solvedMetrics: { ...passRes.audit.solvedMetrics, whiteHaloPixelCount: 2 },
        },
      });
      expect(warnSummary).toContain("[WARN]");
      expect(warnSummary).toContain("초크 반경");

      const failRes = runLineartSemanticDepthMaskSolver(
        createSampleLineartDepthScenario({ maxGapClosePx: 0 }),
      );
      expect(failRes.audit.status).toBe("FAIL");
      expect(failRes.summaryKo).toContain("[FAIL]");
      expect(failRes.summaryKo).toContain("열린 선화 틈");
    });
  });

  describe("8. 통합 오케스트레이터 엔드투엔드 셀프체크", () => {
    it("runLineartSemanticDepthMaskSolver가 샘플 시나리오를 완전 통과(PASS)로 실행한다", () => {
      const result = runLineartSemanticDepthMaskSolver(createSampleLineartDepthScenario());
      expect(result.engineId).toBe(WAVE165_ENGINE_ID);
      expect(result.audit.status).toBe("PASS");
      expect(result.audit.naiveMetrics.whiteHaloPixelCount).toBeGreaterThan(0);
      expect(result.audit.solvedMetrics.whiteHaloPixelCount).toBe(0);
      expect(result.audit.solvedMetrics.crossLayerBleedCount).toBe(0);
      expect(result.audit.solvedMetrics.leakedRegionCount).toBe(0);
      expect(result.wgslValidation.valid).toBe(true);
      expect(result.fingerprintSha256).toHaveLength(64);
      expect(result.auditSvg).toContain("oklch(");
      expect(result.summaryKo).toContain("[PASS]");
    });

    it("틈이 없는 깨끗한 선화 시나리오에서도 불필요한 브리지 없이 PASS를 반환한다", () => {
      const result = runLineartSemanticDepthMaskSolver(
        createSampleLineartDepthScenario({ includeDeliberatePenGap: false }),
      );
      expect(result.audit.status).toBe("PASS");
      expect(result.audit.solvedMetrics.whiteHaloPixelCount).toBe(0);
      expect(result.audit.solvedMetrics.crossLayerBleedCount).toBe(0);
      expect(result.audit.solvedMetrics.leakedRegionCount).toBe(0);
    });

    it("전경 리본 소품(D6)과 캐릭터 헤어(D5)가 만나는 공유 외곽선 아래에서는 D6가 승리한다", () => {
      const result = runLineartSemanticDepthMaskSolver(createSampleLineartDepthScenario());
      // 리본 중심(20, 17), 반지름 4.2 -> 오른쪽 경계(24, 17)는 리본과 헤어가 공유하는 외곽선
      const sharedEdgeClass = getLayerForClassId(result.solvedSolution.resolvedLayerMap[17 * 64 + 24]);
      expect(sharedEdgeClass).toBe("foreground-prop");
    });
  });
});
