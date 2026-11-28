/**
 * Wasm64 Wave 165 공개 배럴 진입점 (`wasm64-wave165-lineart-semantic-depth-mask-and-antibleed-solver`).
 *
 * 웹툰·만화 2D 라인아트 자동 영역 분할·시맨틱 클리핑 마스크(전경/헤어/얼굴/의상/중경/배경 깊이 레이어)
 * 및 오클루전 경계 안티-블리드(Anti-Bleed) 솔버와 `/studio` 런타임 허브 셀프체크 오케스트레이터.
 */

import {
  SEMANTIC_DEPTH_LAYER_ORDER,
  type LineartSemanticDepthMaskOrchestratorResult,
  type LineartSemanticDepthMaskScenario,
  type SemanticSeedHint,
} from "./semantic-mask-types";
import {
  assignSemanticDepthMasks,
  buildGapSealedInkBarrier,
  extractLineartRegions,
} from "./lineart-region-and-depth-segmenter";
import {
  auditAntiBleedMaskQuality,
  evaluateNaiveThresholdMask,
  solveAntiBleedDepthMasks,
} from "./antibleed-choke-and-audit";
import {
  buildDepthMaskAntiBleedWgsl,
  validateDepthMaskAntiBleedWgsl,
} from "./semantic-mask-composite-wgsl";
import {
  computeSemanticMaskFingerprint,
  renderSemanticMaskAuditSvg,
  summarizeSemanticMaskAuditKo,
} from "./semantic-mask-report";

export {
  SEMANTIC_CLASS_ID_TO_LAYER,
  SEMANTIC_DEPTH_LAYER_INFO,
  SEMANTIC_DEPTH_LAYER_ORDER,
  assertValidLineartRaster,
  createZeroClassCountRecord,
  getClassIdForLayer,
  getDepthRankForClass,
  getLayerForClassId,
  type AntiBleedAuditComparison,
  type AntiBleedMaskSolution,
  type AntiBleedQualityMetrics,
  type AntiBleedSolverOptions,
  type DepthMaskWgslBundle,
  type DepthMaskWgslUniformValues,
  type DepthMaskWgslValidationResult,
  type GapSealedBarrierResult,
  type LayerClippingMask,
  type LineartRasterInput,
  type LineartRegionExtractionResult,
  type LineartRegionSummary,
  type LineartSegmentationOptions,
  type LineartSemanticDepthMaskOrchestratorResult,
  type LineartSemanticDepthMaskScenario,
  type RegionBoundingBox,
  type RegionCentroid,
  type SemanticAssignmentSource,
  type SemanticDepthLayerClass,
  type SemanticDepthLayerMetadata,
  type SemanticDepthMaskAssignment,
  type SemanticLayerAssignmentEntry,
  type SemanticMaskAuditStatus,
  type SemanticSeedHint,
} from "./semantic-mask-types";

export {
  assignSemanticDepthMasks,
  buildGapSealedInkBarrier,
  extractLineartRegions,
} from "./lineart-region-and-depth-segmenter";

export {
  auditAntiBleedMaskQuality,
  evaluateNaiveThresholdMask,
  evaluateSingleMaskQuality,
  solveAntiBleedDepthMasks,
} from "./antibleed-choke-and-audit";

export {
  DEPTH_MASK_ANTIBLEED_FRAGMENT_WGSL,
  DEPTH_MASK_UNIFORM_BYTE_LENGTH,
  DEPTH_MASK_UNIFORM_FLOAT_COUNT,
  DEPTH_MASK_WGSL_ENTRY_POINT,
  DEPTH_MASK_WGSL_SHADER_ID,
  buildDepthMaskAntiBleedWgsl,
  validateDepthMaskAntiBleedWgsl,
  type BuildDepthMaskWgslInput,
} from "./semantic-mask-composite-wgsl";

export {
  computeSemanticMaskFingerprint,
  escapeSvgXml,
  renderSemanticMaskAuditSvg,
  sha256MaskHex,
  summarizeSemanticMaskAuditKo,
} from "./semantic-mask-report";

export const WAVE165_ENGINE_ID =
  "wasm64-wave165-lineart-semantic-depth-mask-and-antibleed-solver" as const;

function strokeAlphaFromDistance(dist: number, halfWidth: number, aaWidth: number): number {
  const edge = Math.abs(dist) - halfWidth;
  if (edge <= 0) {
    return 255;
  }
  if (edge >= aaWidth) {
    return 0;
  }
  return Math.round(255 * (1 - edge / aaWidth));
}

function blendInkPixel(inkAlpha: Uint8Array, width: number, x: number, y: number, alpha: number): void {
  if (alpha <= 0) {
    return;
  }
  const idx = y * width + x;
  if (alpha > inkAlpha[idx]) {
    inkAlpha[idx] = alpha;
  }
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-8) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

export interface SampleLineartScenarioOptions {
  /** 의도적 2px 열린 펜선 틈 포함 여부(기본값 true). */
  readonly includeDeliberatePenGap?: boolean;
  /** 열린 틈 높이(기본값 2px). */
  readonly gapHeightPx?: number;
  /** 틈 봉합 반경 재정의. */
  readonly maxGapClosePx?: number;
}

/**
 * 결정론적 64×64 안티앨리어싱 웹툰 반신 라인아트 픽스처를 생성한다.
 * - 전경 리본 소품(D6), 캐릭터 헤어(D5 + 미시드 닫힌 머리카락 고리), 캐릭터 얼굴(D4 + 2px 열린 턱선 틈),
 *   캐릭터 의상(D3), 중경 배경 건물(D2), 배경 하늘(D1) 6계층을 모두 포함한다.
 */
export function createSampleLineartDepthScenario(
  options: SampleLineartScenarioOptions = {},
): LineartSemanticDepthMaskScenario {
  const width = 64;
  const height = 64;
  const inkAlpha = new Uint8Array(width * height);
  const halfWidth = 0.72;
  const aaWidth = 0.95;

  const includeGap = options.includeDeliberatePenGap ?? true;
  const gapHeightPx = Math.max(1, Math.min(6, Math.round(options.gapHeightPx ?? 2)));

  // 1) 캐릭터 얼굴 하단 원호(y >= 25)
  for (let y = 24; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dist = Math.hypot(x - 32, y - 31) - 11.0;
      const alpha = strokeAlphaFromDistance(dist, halfWidth, aaWidth);
      blendInkPixel(inkAlpha, width, x, y, alpha);
    }
  }

  // 2) 캐릭터 헤어 상단 돔(y <= 25) + 앞머리 수평 경계선(y = 25, x = 17..47)
  for (let y = 0; y <= 26; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - 32) / 15.0;
      const ny = (y - 25) / 13.5;
      const norm = Math.hypot(nx, ny);
      if (norm > 1e-4) {
        const approxDist = (norm - 1.0) * 14.2;
        const alpha = strokeAlphaFromDistance(approxDist, halfWidth, aaWidth);
        blendInkPixel(inkAlpha, width, x, y, alpha);
      }
      const bangDist = pointToSegmentDistance(x, y, 17, 25, 47, 25);
      blendInkPixel(inkAlpha, width, x, y, strokeAlphaFromDistance(bangDist, halfWidth, aaWidth));
    }
  }

  // 3) 헤어 내부 미시드 닫힌 머리카락 하이라이트 고리(중심 38, 18, 반지름 3.0)
  for (let y = 13; y <= 23; y += 1) {
    for (let x = 33; x <= 43; x += 1) {
      const d = Math.hypot(x - 38, y - 18) - 3.0;
      blendInkPixel(inkAlpha, width, x, y, strokeAlphaFromDistance(d, 0.55, 0.85));
    }
  }

  // 4) 전경 리본 소품(중심 20, 17, 반지름 4.2): 내부 헤어 선을 지우고 위에 겹쳐 그림
  for (let y = 11; y <= 23; y += 1) {
    for (let x = 14; x <= 26; x += 1) {
      const r = Math.hypot(x - 20, y - 17);
      if (r < 3.4) {
        inkAlpha[y * width + x] = 0;
      }
      const d = r - 4.2;
      blendInkPixel(inkAlpha, width, x, y, strokeAlphaFromDistance(d, halfWidth, aaWidth));
    }
  }

  // 5) 캐릭터 의상(어깨·칼라 사각 윤곽: x = 17..47, y = 42..57)
  const outfitEdges: ReadonlyArray<readonly [number, number, number, number]> = [
    [17, 42, 47, 42],
    [47, 42, 47, 57],
    [47, 57, 17, 57],
    [17, 57, 17, 42],
  ];
  for (let y = 40; y <= 59; y += 1) {
    for (let x = 15; x <= 49; x += 1) {
      for (let e = 0; e < outfitEdges.length; e += 1) {
        const seg = outfitEdges[e];
        const d = pointToSegmentDistance(x, y, seg[0], seg[1], seg[2], seg[3]);
        blendInkPixel(inkAlpha, width, x, y, strokeAlphaFromDistance(d, halfWidth, aaWidth));
      }
    }
  }

  // 6) 중경 배경 건물 블록(x = 52..60, y = 24..56)
  const envEdges: ReadonlyArray<readonly [number, number, number, number]> = [
    [52, 24, 60, 24],
    [60, 24, 60, 56],
    [60, 56, 52, 56],
    [52, 56, 52, 24],
  ];
  for (let y = 22; y <= 58; y += 1) {
    for (let x = 50; x <= 62; x += 1) {
      for (let e = 0; e < envEdges.length; e += 1) {
        const seg = envEdges[e];
        const d = pointToSegmentDistance(x, y, seg[0], seg[1], seg[2], seg[3]);
        blendInkPixel(inkAlpha, width, x, y, strokeAlphaFromDistance(d, halfWidth, aaWidth));
      }
    }
  }

  // 7) 얼굴 오른쪽 볼 윤곽선에 의도적 열린 펜선 틈(기본 2px: y = 32..33) 생성
  if (includeGap) {
    const gapStartY = 32;
    const gapEndY = Math.min(height - 1, gapStartY + gapHeightPx - 1);
    for (let y = gapStartY; y <= gapEndY; y += 1) {
      for (let x = 40; x <= 46; x += 1) {
        inkAlpha[y * width + x] = 0;
      }
    }
  }

  const seeds: readonly SemanticSeedHint[] = [
    { x: 4, y: 4, layerClass: "background-sky", labelKo: "배경 하늘" },
    { x: 56, y: 40, layerClass: "midground-env", labelKo: "중경 건물" },
    { x: 32, y: 50, layerClass: "character-outfit", labelKo: "캐릭터 의상" },
    { x: 32, y: 33, layerClass: "character-face", labelKo: "캐릭터 얼굴" },
    { x: 30, y: 18, layerClass: "character-hair", labelKo: "캐릭터 헤어" },
    { x: 20, y: 17, layerClass: "foreground-prop", labelKo: "전경 리본 소품" },
  ];

  return {
    scenarioId: "wave165-sample-character-bust-64",
    titleKo: "웹툰 반신 캐릭터 라인아트 시맨틱 깊이 마스크 샘플",
    raster: { width, height, inkAlpha },
    seeds,
    segmentationOptions: {
      inkBarrierThreshold: 128,
      maxGapClosePx: options.maxGapClosePx ?? 3,
      minMicroRegionArea: 64,
    },
    antiBleedOptions: {
      antiAliasFloor: 8,
      opaqueInkCeiling: 245,
      maxChokeRadiusPx: 3,
    },
  };
}

/**
 * Wave 165 고수준 오케스트레이터(`/studio` 런타임 허브 셀프체크 및 채색 파이프라인 진입점).
 */
export function runLineartSemanticDepthMaskSolver(
  scenario: LineartSemanticDepthMaskScenario,
): LineartSemanticDepthMaskOrchestratorResult {
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
  const naiveSolution = evaluateNaiveThresholdMask(scenario.raster, assignment);
  const solvedSolution = solveAntiBleedDepthMasks(
    scenario.raster,
    barrier,
    assignment,
    scenario.antiBleedOptions,
  );
  const audit = auditAntiBleedMaskQuality(
    scenario.raster,
    assignment,
    naiveSolution,
    solvedSolution,
    scenario.antiBleedOptions,
  );
  const wgsl = buildDepthMaskAntiBleedWgsl({
    canvasWidth: scenario.raster.width,
    canvasHeight: scenario.raster.height,
    antiAliasFloor: scenario.antiBleedOptions?.antiAliasFloor ?? 8,
    chokeBiasPx: scenario.antiBleedOptions?.maxChokeRadiusPx ?? 3,
    activeLayerCount: SEMANTIC_DEPTH_LAYER_ORDER.length,
  });
  const wgslValidation = validateDepthMaskAntiBleedWgsl(wgsl);
  const fingerprintSha256 = computeSemanticMaskFingerprint(
    scenario.raster,
    scenario.seeds,
    assignment,
    solvedSolution,
    audit,
  );
  const auditSvg = renderSemanticMaskAuditSvg({
    titleKo: scenario.titleKo,
    raster: scenario.raster,
    barrier,
    solvedSolution,
    audit,
  });
  const summaryKo = summarizeSemanticMaskAuditKo({
    titleKo: scenario.titleKo,
    barrier,
    extraction,
    assignment,
    audit,
  });

  return {
    engineId: WAVE165_ENGINE_ID,
    scenarioId: scenario.scenarioId,
    titleKo: scenario.titleKo,
    barrier,
    extraction,
    assignment,
    naiveSolution,
    solvedSolution,
    audit,
    wgsl,
    wgslValidation,
    fingerprintSha256,
    auditSvg,
    summaryKo,
  };
}
