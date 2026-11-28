/**
 * Wave 165: 서브-잉크 안티-블리드(Anti-Bleed) 초크/스프레드 솔버 및 전후 품질 감사기.
 *
 * - `evaluateNaiveThresholdMask`: 선화 임계치 바깥 열린 영역만 채우는 기준선(반투명 흰 테두리 헤일로 발생).
 * - `solveAntiBleedDepthMasks`: 반투명·불투명 선화 픽셀 아래로만 웨이브프런트(거리 우선 + 전경 깊이 우선)
 *   확장을 수행해 흰 테두리(`whiteHaloPixelCount === 0`)와 레이어 간 색 번짐(`crossLayerBleedCount === 0`)을 동시 해소한다.
 * - `auditAntiBleedMaskQuality`: 기준선 대비 개선율과 무침범·무누수 보증을 정량 감사한다.
 */

import {
  SEMANTIC_DEPTH_LAYER_INFO,
  SEMANTIC_DEPTH_LAYER_ORDER,
  assertValidLineartRaster,
  createZeroClassCountRecord,
  getLayerForClassId,
  type AntiBleedAuditComparison,
  type AntiBleedMaskSolution,
  type AntiBleedQualityMetrics,
  type AntiBleedSolverOptions,
  type GapSealedBarrierResult,
  type LayerClippingMask,
  type LineartRasterInput,
  type SemanticDepthLayerClass,
  type SemanticDepthMaskAssignment,
  type SemanticMaskAuditStatus,
} from "./semantic-mask-types";

const DEFAULT_ANTI_ALIAS_FLOOR = 8;
const DEFAULT_OPAQUE_INK_CEILING = 245;
const DEFAULT_MAX_CHOKE_RADIUS_PX = 3;

const CARDINAL_4: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const DIAGONAL_4: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  const rounded = Math.round(value);
  if (rounded < min) {
    return min;
  }
  if (rounded > max) {
    return max;
  }
  return rounded;
}

function buildLayerMasksFromResolvedMap(
  coreLayerMap: Uint8Array,
  resolvedLayerMap: Uint8Array,
): readonly LayerClippingMask[] {
  const totalPixels = resolvedLayerMap.length;
  const masks: LayerClippingMask[] = [];

  for (let c = 0; c < SEMANTIC_DEPTH_LAYER_ORDER.length; c += 1) {
    const layerClass = SEMANTIC_DEPTH_LAYER_ORDER[c];
    const info = SEMANTIC_DEPTH_LAYER_INFO[layerClass];
    const maskAlpha = new Uint8Array(totalPixels);
    let corePixelCount = 0;
    let underInkExpandedPixelCount = 0;

    for (let i = 0; i < totalPixels; i += 1) {
      if (resolvedLayerMap[i] === info.classId) {
        maskAlpha[i] = 255;
        if (coreLayerMap[i] === info.classId) {
          corePixelCount += 1;
        } else {
          underInkExpandedPixelCount += 1;
        }
      }
    }

    masks.push({
      layerClass,
      depthRank: info.depthRank,
      classId: info.classId,
      labelKo: info.labelKo,
      maskAlpha,
      corePixelCount,
      underInkExpandedPixelCount,
      totalMaskedPixelCount: corePixelCount + underInkExpandedPixelCount,
    });
  }

  return masks;
}

/**
 * 기준선(나이브 임계치 채우기): 열린 코어 영역 픽셀만 채우고 선화 경계 픽셀은 비워 둔다.
 * 안티앨리어싱 선화 가장자리에서 흰 테두리(`whiteHaloPixelCount > 0`)가 드러나는 대조군 역할을 한다.
 */
export function evaluateNaiveThresholdMask(
  raster: LineartRasterInput,
  assignment: SemanticDepthMaskAssignment,
): AntiBleedMaskSolution {
  assertValidLineartRaster(raster);
  const resolvedLayerMap = new Uint8Array(assignment.coreLayerMap);
  const layerMasks = buildLayerMasksFromResolvedMap(assignment.coreLayerMap, resolvedLayerMap);

  return {
    width: raster.width,
    height: raster.height,
    mode: "naive-threshold",
    resolvedLayerMap,
    layerMasks,
    underInkFilledPixelCount: 0,
    iterationsExecuted: 0,
  };
}

/**
 * 서브-잉크 안티-블리드 깊이 마스크 솔버.
 *
 * - 열린 영역(`coreLayerMap[i] > 0`)은 절대 덮어쓰지 않는다(영역 간 색 침범 0 보장).
 * - 반투명·불투명 선화 픽셀(`inkAlpha >= antiAliasFloor`)과 틈 봉합 브리지 픽셀 아래로만
 *   1px 링 단위로 동시 확장하며, 동일 거리 경합 시 전경 깊이(`classId = depthRank`)가 높은 레이어가 승리한다.
 */
export function solveAntiBleedDepthMasks(
  raster: LineartRasterInput,
  barrier: GapSealedBarrierResult,
  assignment: SemanticDepthMaskAssignment,
  options: AntiBleedSolverOptions = {},
): AntiBleedMaskSolution {
  assertValidLineartRaster(raster);
  const { width, height, inkAlpha } = raster;
  const antiAliasFloor = clampInt(options.antiAliasFloor ?? DEFAULT_ANTI_ALIAS_FLOOR, 1, 254);
  const maxChokeRadiusPx = clampInt(
    options.maxChokeRadiusPx ?? DEFAULT_MAX_CHOKE_RADIUS_PX,
    1,
    12,
  );

  const resolvedLayerMap = new Uint8Array(assignment.coreLayerMap);
  let underInkFilledPixelCount = 0;
  let iterationsExecuted = 0;

  // 선화 경계 또는 틈 브리지 픽셀 중 아직 채워지지 않은 픽셀만 서브-잉크 확장 허용
  const isEligibleUnderInk = (idx: number): boolean => {
    if (resolvedLayerMap[idx] !== 0) {
      return false;
    }
    return inkAlpha[idx] >= antiAliasFloor || barrier.sealedBarrierMask[idx] === 1;
  };

  for (let step = 1; step <= maxChokeRadiusPx; step += 1) {
    const prevMap = new Uint8Array(resolvedLayerMap);
    let filledThisStep = 0;

    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = rowOffset + x;
        if (!isEligibleUnderInk(idx)) {
          continue;
        }

        // 1순위: 4-연결 직교 이웃 중 가장 높은 깊이 순위(classId) 채택
        let bestClassId = 0;
        for (let d = 0; d < CARDINAL_4.length; d += 1) {
          const nx = x + CARDINAL_4[d][0];
          const ny = y + CARDINAL_4[d][1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const neighborClass = prevMap[ny * width + nx];
          if (neighborClass > bestClassId) {
            bestClassId = neighborClass;
          }
        }

        // 2순위: 직교 이웃이 없을 때만 대각선 이웃 중 최고 깊이 순위 채택(45° 반투명 가장자리 누락 방지)
        if (bestClassId === 0) {
          for (let d = 0; d < DIAGONAL_4.length; d += 1) {
            const nx = x + DIAGONAL_4[d][0];
            const ny = y + DIAGONAL_4[d][1];
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            const neighborClass = prevMap[ny * width + nx];
            if (neighborClass > bestClassId) {
              bestClassId = neighborClass;
            }
          }
        }

        if (bestClassId > 0) {
          resolvedLayerMap[idx] = bestClassId;
          filledThisStep += 1;
        }
      }
    }

    if (filledThisStep === 0) {
      break;
    }
    underInkFilledPixelCount += filledThisStep;
    iterationsExecuted = step;
  }

  const layerMasks = buildLayerMasksFromResolvedMap(assignment.coreLayerMap, resolvedLayerMap);

  return {
    width,
    height,
    mode: "sub-ink-antibleed",
    resolvedLayerMap,
    layerMasks,
    underInkFilledPixelCount,
    iterationsExecuted,
  };
}

/**
 * 단일 마스크 해(`naive` 또는 `solved`)의 흰 테두리, 레이어 간 색 침범, 커버리지를 정밀 계측한다.
 */
export function evaluateSingleMaskQuality(
  raster: LineartRasterInput,
  assignment: SemanticDepthMaskAssignment,
  solution: AntiBleedMaskSolution,
  options: AntiBleedSolverOptions = {},
): AntiBleedQualityMetrics {
  assertValidLineartRaster(raster);
  const { width, height, inkAlpha } = raster;
  const totalPixelCount = width * height;
  const antiAliasFloor = clampInt(options.antiAliasFloor ?? DEFAULT_ANTI_ALIAS_FLOOR, 1, 254);
  const opaqueInkCeiling = clampInt(
    options.opaqueInkCeiling ?? DEFAULT_OPAQUE_INK_CEILING,
    antiAliasFloor + 1,
    255,
  );

  const coreMap = assignment.coreLayerMap;
  const resolvedMap = solution.resolvedLayerMap;

  let whiteHaloPixelCount = 0;
  let crossLayerBleedCount = 0;
  let coveredPixelCount = 0;
  const perLayerCounts = createZeroClassCountRecord();

  // 레이어 마스크 간 열린 영역 중복 침범 감지용 카운트
  const openClaimCounts = new Uint8Array(totalPixelCount);
  for (let m = 0; m < solution.layerMasks.length; m += 1) {
    const mask = solution.layerMasks[m];
    const maskAlpha = mask.maskAlpha;
    for (let i = 0; i < totalPixelCount; i += 1) {
      if (maskAlpha[i] > 0 && coreMap[i] > 0) {
        openClaimCounts[i] += 1;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x;
      const alpha = inkAlpha[idx];
      const coreClass = coreMap[idx];
      const resolvedClass = resolvedMap[idx];

      if (resolvedClass > 0) {
        const cls = getLayerForClassId(resolvedClass);
        if (cls) {
          perLayerCounts[cls] += 1;
        }
        coveredPixelCount += 1;
      } else if (alpha >= opaqueInkCeiling) {
        // 완전 불투명 선화 중심부는 밑색이 비치지 않으므로 시각적 커버리지에 포함
        coveredPixelCount += 1;
      }

      // 1) 흰 테두리(White Halo) 판정: 반투명 잉크 픽셀 아래에 마스크가 비어 흰 종이가 비치는 경우
      if (alpha >= antiAliasFloor && alpha < opaqueInkCeiling && resolvedClass === 0) {
        whiteHaloPixelCount += 1;
      }

      // 2) 교차 레이어 색 번짐(Cross-Layer Bleed) 판정:
      //    (a) 열린 코어 영역 픽셀이 타 레이어로 덮였거나 둘 이상 레이어 마스크가 중복 점유한 경우
      if (coreClass > 0) {
        if (resolvedClass !== coreClass || openClaimCounts[idx] > 1) {
          crossLayerBleedCount += 1;
        }
        continue;
      }

      //    (b) 선화의 한쪽 면(단일 열린 영역과만 직교 인접)에 놓인 반투명 가장자리에
      //        반대편 레이어 색이 선을 넘어 침범한 경우
      if (alpha >= antiAliasFloor && alpha < opaqueInkCeiling && resolvedClass > 0) {
        let exclusiveCoreClass = 0;
        let hasMultipleCoreNeighbors = false;
        for (let d = 0; d < CARDINAL_4.length; d += 1) {
          const nx = x + CARDINAL_4[d][0];
          const ny = y + CARDINAL_4[d][1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const nCore = coreMap[ny * width + nx];
          if (nCore > 0) {
            if (exclusiveCoreClass === 0) {
              exclusiveCoreClass = nCore;
            } else if (exclusiveCoreClass !== nCore) {
              hasMultipleCoreNeighbors = true;
            }
          }
        }
        if (
          exclusiveCoreClass > 0 &&
          !hasMultipleCoreNeighbors &&
          resolvedClass !== exclusiveCoreClass
        ) {
          crossLayerBleedCount += 1;
        }
      }
    }
  }

  const perLayerCoverage: Record<SemanticDepthLayerClass, number> = createZeroClassCountRecord();
  for (let c = 0; c < SEMANTIC_DEPTH_LAYER_ORDER.length; c += 1) {
    const cls = SEMANTIC_DEPTH_LAYER_ORDER[c];
    perLayerCoverage[cls] = totalPixelCount > 0 ? perLayerCounts[cls] / totalPixelCount : 0;
  }

  return {
    whiteHaloPixelCount,
    crossLayerBleedCount,
    leakedRegionCount: assignment.leakedRegionCount,
    coverageRatio: totalPixelCount > 0 ? coveredPixelCount / totalPixelCount : 0,
    coveredPixelCount,
    totalPixelCount,
    perLayerCoverage,
  };
}

/**
 * 기준선 나이브 채우기 vs 서브-잉크 안티-블리드 솔버의 전후 품질 감사 비교표를 산출한다.
 */
export function auditAntiBleedMaskQuality(
  raster: LineartRasterInput,
  assignment: SemanticDepthMaskAssignment,
  naiveSolution: AntiBleedMaskSolution,
  solvedSolution: AntiBleedMaskSolution,
  options: AntiBleedSolverOptions = {},
): AntiBleedAuditComparison {
  const naiveMetrics = evaluateSingleMaskQuality(raster, assignment, naiveSolution, options);
  const solvedMetrics = evaluateSingleMaskQuality(raster, assignment, solvedSolution, options);

  const haloEliminatedPixels = Math.max(
    0,
    naiveMetrics.whiteHaloPixelCount - solvedMetrics.whiteHaloPixelCount,
  );
  const haloReductionRatio =
    naiveMetrics.whiteHaloPixelCount > 0
      ? haloEliminatedPixels / naiveMetrics.whiteHaloPixelCount
      : solvedMetrics.whiteHaloPixelCount === 0
        ? 1
        : 0;

  const zeroBleedGuaranteed = solvedMetrics.crossLayerBleedCount === 0;
  const zeroLeakGuaranteed = solvedMetrics.leakedRegionCount === 0;

  let status: SemanticMaskAuditStatus = "PASS";
  if (!zeroBleedGuaranteed || !zeroLeakGuaranteed) {
    status = "FAIL";
  } else if (solvedMetrics.whiteHaloPixelCount > 0) {
    status = solvedMetrics.whiteHaloPixelCount <= 4 ? "WARN" : "FAIL";
  }

  return {
    naiveMetrics,
    solvedMetrics,
    haloReductionRatio,
    haloEliminatedPixels,
    zeroBleedGuaranteed,
    zeroLeakGuaranteed,
    status,
  };
}
