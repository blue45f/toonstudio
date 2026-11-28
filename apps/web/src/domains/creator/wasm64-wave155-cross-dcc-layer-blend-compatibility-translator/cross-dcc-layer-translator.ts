/**
 * Wave 155 — 크로스-DCC 레이어 트리 호환성 감사기 및 최적 대체 블렌드 근사 솔버.
 *
 * - 무손실 직매핑(`exact-match`), 최적 근사 대체 매핑(`approximated-blend`),
 *   래스터화·색심도·통과 폴더 위험을 분류하고 순수 ES2017 SHA-256 매니페스트 지문을 산출한다.
 */

import {
  BLEND_MODE_LABEL_KO,
  CANONICAL_BLEND_MODES,
  clampFiniteRange,
  clampUnit,
  evaluateBlendModeOklabFidelity,
  getDccCapabilityProfile,
  isBlendModeSupportedInDcc,
  PIXEL_BLEND_MODES,
  roundFixed,
  type CanonicalBlendMode,
  type DccBitDepth,
  type DccCapabilityProfile,
  type DccFormatId,
  type DccLayerKind,
} from "./dcc-blend-math-and-matrix";
import { sha256CrossDccHex } from "./dcc-audit-sha256";
import {
  ALL_DCC_LOSS_RISK_CODES,
  appendNonBlendLayerRisks,
  buildEmptyRiskCounts,
  collectNonNormalDescendants,
  computeRiskPenalty,
  resolveTargetBitDepth,
  type DccLayerNode,
  type DccLayerRiskItem,
  type DccLossRiskCode,
  type DccRiskSeverity,
} from "./dcc-layer-risk-rules";

export { sha256CrossDccHex } from "./dcc-audit-sha256";
export {
  ALL_DCC_LOSS_RISK_CODES,
  type DccLayerNode,
  type DccLayerRiskItem,
  type DccLossRiskCode,
  type DccRiskSeverity,
} from "./dcc-layer-risk-rules";

export type LayerBlendMappingStatus = "exact-match" | "approximated-blend";
export type DccAuditGrade = "PASS" | "WARN" | "FAIL";

export interface BlendModeApproximationCandidate {
  readonly targetBlendMode: CanonicalBlendMode;
  readonly recommendedOpacity: number;
  readonly meanDeltaE: number;
  readonly maxDeltaE: number;
  readonly rmsDeltaE: number;
  readonly uncompensatedMeanDeltaE: number;
  readonly opacityImprovementDeltaE: number;
}

export interface ClosestBlendModeResult {
  readonly sourceBlendMode: CanonicalBlendMode;
  readonly sourceOpacity: number;
  readonly targetDcc: DccFormatId;
  readonly isExactMatch: boolean;
  readonly bestMatch: BlendModeApproximationCandidate;
  readonly alternatives: readonly BlendModeApproximationCandidate[];
}

export interface TranslatedLayerAuditItem {
  readonly layerId: string;
  readonly nameKo: string;
  readonly layerKind: DccLayerKind;
  readonly visible: boolean;
  readonly clippingMask: boolean;
  readonly sourceBitDepth: DccBitDepth;
  readonly targetBitDepth: DccBitDepth;
  readonly depth: number;
  readonly parentLayerId: string | null;
  readonly sourceBlendMode: CanonicalBlendMode;
  readonly targetBlendMode: CanonicalBlendMode;
  readonly sourceOpacity: number;
  readonly recommendedOpacity: number;
  readonly blendMappingStatus: LayerBlendMappingStatus;
  readonly isLayerLossless: boolean;
  readonly rasterizationForced: boolean;
  readonly oklabMeanDeltaE: number;
  readonly oklabMaxDeltaE: number;
  readonly uncompensatedMeanDeltaE: number;
  readonly approximationAlternatives: readonly BlendModeApproximationCandidate[];
  readonly risks: readonly DccLayerRiskItem[];
  readonly children: readonly TranslatedLayerAuditItem[];
}

export interface TranslateDccLayerTreeInput {
  readonly documentId: string;
  readonly documentTitleKo: string;
  readonly sourceDcc: DccFormatId;
  readonly targetDcc: DccFormatId;
  readonly layers: readonly DccLayerNode[];
}

export interface DccLayerTranslationAuditResult {
  readonly schemaVersion: "toonstudio.wave155.cross-dcc-audit.v1";
  readonly documentId: string;
  readonly documentTitleKo: string;
  readonly sourceDcc: DccFormatId;
  readonly targetDcc: DccFormatId;
  readonly sourceProfile: DccCapabilityProfile;
  readonly targetProfile: DccCapabilityProfile;
  readonly totalLayerCount: number;
  readonly exactMatchLayerCount: number;
  readonly approximatedBlendLayerCount: number;
  readonly rasterizationRiskLayerCount: number;
  readonly bitDepthBandingLayerCount: number;
  readonly passThroughFlattenLayerCount: number;
  readonly meanDocumentOklabDeltaE: number;
  readonly maxDocumentOklabDeltaE: number;
  readonly compatibilityScore: number;
  readonly isStrictLossless: boolean;
  readonly auditGrade: DccAuditGrade;
  readonly translatedLayers: readonly TranslatedLayerAuditItem[];
  readonly flattenedLayers: readonly TranslatedLayerAuditItem[];
  readonly blockers: readonly DccLayerRiskItem[];
  readonly warnings: readonly DccLayerRiskItem[];
  readonly allRisks: readonly DccLayerRiskItem[];
  readonly riskCountByCode: Readonly<Record<DccLossRiskCode, number>>;
  readonly translationManifestSha256Hex: string;
}

const OPACITY_SEARCH_GRID: readonly number[] = [
  0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
  0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0,
];

function blendModeOrderIndex(mode: CanonicalBlendMode): number {
  const idx = CANONICAL_BLEND_MODES.indexOf(mode);
  return idx >= 0 ? idx : 999;
}

function formatOpacityPercent(opacity: number): string {
  return `${Math.round(clampUnit(opacity, 1) * 100)}%`;
}

function optimizeOpacityForCandidate(
  sourceBlendMode: CanonicalBlendMode,
  targetBlendMode: CanonicalBlendMode,
  sourceOpacity: number,
): BlendModeApproximationCandidate {
  const uncompensated = evaluateBlendModeOklabFidelity(sourceBlendMode, targetBlendMode, {
    sourceOpacity,
    targetOpacity: sourceOpacity,
  });

  if (sourceOpacity <= 0) {
    return {
      targetBlendMode,
      recommendedOpacity: 0,
      meanDeltaE: 0,
      maxDeltaE: 0,
      rmsDeltaE: 0,
      uncompensatedMeanDeltaE: 0,
      opacityImprovementDeltaE: 0,
    };
  }

  let bestOpacity = sourceOpacity;
  let bestFidelity = uncompensated;

  for (let i = 0; i < OPACITY_SEARCH_GRID.length; i += 1) {
    const candidateOpacity = OPACITY_SEARCH_GRID[i];
    if (Math.abs(candidateOpacity - sourceOpacity) < 1e-6) continue;
    const trial = evaluateBlendModeOklabFidelity(sourceBlendMode, targetBlendMode, {
      sourceOpacity,
      targetOpacity: candidateOpacity,
    });
    if (trial.meanDeltaE + 1e-5 < bestFidelity.meanDeltaE) {
      bestFidelity = trial;
      bestOpacity = candidateOpacity;
    }
  }

  const fineStart = Math.max(0.01, roundFixed(bestOpacity - 0.04, 2));
  const fineEnd = Math.min(1, roundFixed(bestOpacity + 0.04, 2));
  for (let step = 0; step <= 8; step += 1) {
    const candidateOpacity = roundFixed(fineStart + step * 0.01, 2);
    if (candidateOpacity > fineEnd + 1e-6) break;
    if (Math.abs(candidateOpacity - bestOpacity) < 1e-6) continue;
    const trial = evaluateBlendModeOklabFidelity(sourceBlendMode, targetBlendMode, {
      sourceOpacity,
      targetOpacity: candidateOpacity,
    });
    if (trial.meanDeltaE + 1e-5 < bestFidelity.meanDeltaE) {
      bestFidelity = trial;
      bestOpacity = candidateOpacity;
    }
  }

  const improvement = Math.max(0, roundFixed(uncompensated.meanDeltaE - bestFidelity.meanDeltaE, 6));
  const chosenOpacity = improvement >= 1e-4 ? roundFixed(bestOpacity, 4) : sourceOpacity;
  const finalFidelity = chosenOpacity === sourceOpacity ? uncompensated : bestFidelity;

  return {
    targetBlendMode,
    recommendedOpacity: chosenOpacity,
    meanDeltaE: finalFidelity.meanDeltaE,
    maxDeltaE: finalFidelity.maxDeltaE,
    rmsDeltaE: finalFidelity.rmsDeltaE,
    uncompensatedMeanDeltaE: uncompensated.meanDeltaE,
    opacityImprovementDeltaE: roundFixed(
      Math.max(0, uncompensated.meanDeltaE - finalFidelity.meanDeltaE),
      6,
    ),
  };
}

/**
 * 타깃 DCC 지원 블렌드모드 집합 중 64색 OKLab 프로브 기준 ΔE가 최소가 되는
 * 최적 대체 블렌드모드와 추천 불투명도 보정치를 자동 탐색한다.
 */
export function findClosestSupportedBlendMode(
  sourceBlendMode: CanonicalBlendMode,
  targetDcc: DccFormatId,
  sourceOpacity = 1,
): ClosestBlendModeResult {
  const safeOpacity = roundFixed(clampUnit(sourceOpacity, 1), 4);
  const targetProfile = getDccCapabilityProfile(targetDcc);

  if (isBlendModeSupportedInDcc(targetDcc, sourceBlendMode)) {
    return {
      sourceBlendMode,
      sourceOpacity: safeOpacity,
      targetDcc,
      isExactMatch: true,
      bestMatch: {
        targetBlendMode: sourceBlendMode,
        recommendedOpacity: safeOpacity,
        meanDeltaE: 0,
        maxDeltaE: 0,
        rmsDeltaE: 0,
        uncompensatedMeanDeltaE: 0,
        opacityImprovementDeltaE: 0,
      },
      alternatives: [],
    };
  }

  if (sourceBlendMode === "pass-through") {
    return {
      sourceBlendMode,
      sourceOpacity: safeOpacity,
      targetDcc,
      isExactMatch: false,
      bestMatch: {
        targetBlendMode: "normal",
        recommendedOpacity: safeOpacity,
        meanDeltaE: 0,
        maxDeltaE: 0,
        rmsDeltaE: 0,
        uncompensatedMeanDeltaE: 0,
        opacityImprovementDeltaE: 0,
      },
      alternatives: [],
    };
  }

  const supportedPixelModes: CanonicalBlendMode[] = [];
  for (let i = 0; i < targetProfile.supportedBlendModes.length; i += 1) {
    const mode = targetProfile.supportedBlendModes[i];
    if (PIXEL_BLEND_MODES.indexOf(mode) >= 0) supportedPixelModes.push(mode);
  }

  const rankedBase = supportedPixelModes
    .map((candidateMode) => ({
      candidateMode,
      base: evaluateBlendModeOklabFidelity(sourceBlendMode, candidateMode, {
        sourceOpacity: safeOpacity,
        targetOpacity: safeOpacity,
      }),
    }))
    .sort((a, b) => {
      if (a.base.meanDeltaE !== b.base.meanDeltaE) return a.base.meanDeltaE - b.base.meanDeltaE;
      if (a.base.maxDeltaE !== b.base.maxDeltaE) return a.base.maxDeltaE - b.base.maxDeltaE;
      return blendModeOrderIndex(a.candidateMode) - blendModeOrderIndex(b.candidateMode);
    });

  const shortlistCount = Math.min(5, rankedBase.length);
  const refined: BlendModeApproximationCandidate[] = [];
  for (let i = 0; i < shortlistCount; i += 1) {
    refined.push(
      optimizeOpacityForCandidate(sourceBlendMode, rankedBase[i].candidateMode, safeOpacity),
    );
  }

  refined.sort((a, b) => {
    if (a.meanDeltaE !== b.meanDeltaE) return a.meanDeltaE - b.meanDeltaE;
    if (a.maxDeltaE !== b.maxDeltaE) return a.maxDeltaE - b.maxDeltaE;
    return blendModeOrderIndex(a.targetBlendMode) - blendModeOrderIndex(b.targetBlendMode);
  });

  const bestMatch: BlendModeApproximationCandidate = refined[0] ?? {
    targetBlendMode: "normal",
    recommendedOpacity: safeOpacity,
    meanDeltaE: 0,
    maxDeltaE: 0,
    rmsDeltaE: 0,
    uncompensatedMeanDeltaE: 0,
    opacityImprovementDeltaE: 0,
  };

  return {
    sourceBlendMode,
    sourceOpacity: safeOpacity,
    targetDcc,
    isExactMatch: false,
    bestMatch,
    alternatives: refined.slice(1, 4),
  };
}

function translateSingleLayerRecursive(
  node: DccLayerNode,
  depth: number,
  parentLayerId: string | null,
  sourceDcc: DccFormatId,
  targetDcc: DccFormatId,
  targetProfile: DccCapabilityProfile,
  sameDccTransfer: boolean,
  flattened: TranslatedLayerAuditItem[],
): TranslatedLayerAuditItem {
  const safeOpacity = roundFixed(clampUnit(node.opacity, 1), 4);
  const visible = node.visible !== false;
  const risks: DccLayerRiskItem[] = [];
  const targetBitDepth = sameDccTransfer
    ? node.bitDepth
    : resolveTargetBitDepth(node.bitDepth, targetProfile);

  let targetBlendMode: CanonicalBlendMode = node.blendMode;
  let recommendedOpacity = safeOpacity;
  let blendMappingStatus: LayerBlendMappingStatus = "exact-match";
  let oklabMeanDeltaE = 0;
  let oklabMaxDeltaE = 0;
  let uncompensatedMeanDeltaE = 0;
  let approximationAlternatives: readonly BlendModeApproximationCandidate[] = [];
  let rasterizationForced = false;

  if (!sameDccTransfer) {
    if (node.layerKind === "group-folder" && node.blendMode === "pass-through") {
      if (!targetProfile.supportsPassThroughGroup) {
        targetBlendMode = "normal";
        blendMappingStatus = "approximated-blend";
        const affectedChildren: DccLayerNode[] = [];
        if (node.children && node.children.length > 0) {
          collectNonNormalDescendants(node.children, affectedChildren);
        }

        let sumChildMean = 0;
        let maxChildPeak = 0;
        let measuredBlendChildCount = 0;
        for (let i = 0; i < affectedChildren.length; i += 1) {
          const desc = affectedChildren[i];
          if (desc.blendMode !== "normal" && desc.blendMode !== "pass-through") {
            const lossFidelity = evaluateBlendModeOklabFidelity(desc.blendMode, "normal", {
              sourceOpacity: clampUnit(desc.opacity, 1),
              targetOpacity: clampUnit(desc.opacity, 1),
            });
            sumChildMean += lossFidelity.meanDeltaE;
            if (lossFidelity.maxDeltaE > maxChildPeak) maxChildPeak = lossFidelity.maxDeltaE;
            measuredBlendChildCount += 1;
          }
        }
        if (measuredBlendChildCount > 0) {
          oklabMeanDeltaE = roundFixed(sumChildMean / measuredBlendChildCount, 6);
          oklabMaxDeltaE = roundFixed(maxChildPeak, 6);
          uncompensatedMeanDeltaE = oklabMeanDeltaE;
        }

        const hasActiveChildEffects = affectedChildren.length > 0;
        risks.push({
          layerId: node.layerId,
          layerNameKo: node.nameKo,
          code: "pass-through-group-flatten-risk",
          severity: hasActiveChildEffects ? "blocker" : "warning",
          messageKo: hasActiveChildEffects
            ? `「${node.nameKo}」 통과(Pass-Through) 폴더가 ${targetProfile.shortLabel}에서 격리 일반 폴더로 바뀌어 하위 효과 레이어 ${affectedChildren.length}건의 배경 합성이 깨집니다.`
            : `「${node.nameKo}」 통과(Pass-Through) 폴더가 ${targetProfile.shortLabel}에서 일반 폴더로 격리됩니다.`,
          mitigationKo: hasActiveChildEffects
            ? "폴더 내부의 발광·곱하기·보정 레이어를 폴더 밖으로 꺼내거나 별도 합성본을 고정한 뒤 내보내세요."
            : "추후 폴더 안에 보정·광원 레이어를 넣지 않도록 폴더 구조를 점검하세요.",
          measuredDeltaE: oklabMeanDeltaE,
        });
      }
    } else if (!isBlendModeSupportedInDcc(targetDcc, node.blendMode)) {
      const approx = findClosestSupportedBlendMode(node.blendMode, targetDcc, safeOpacity);
      targetBlendMode = approx.bestMatch.targetBlendMode;
      recommendedOpacity = approx.bestMatch.recommendedOpacity;
      blendMappingStatus = "approximated-blend";
      oklabMeanDeltaE = approx.bestMatch.meanDeltaE;
      oklabMaxDeltaE = approx.bestMatch.maxDeltaE;
      uncompensatedMeanDeltaE = approx.bestMatch.uncompensatedMeanDeltaE;
      approximationAlternatives = approx.alternatives;

      const opacityNote =
        recommendedOpacity !== safeOpacity
          ? ` (불투명도 ${formatOpacityPercent(safeOpacity)} → ${formatOpacityPercent(recommendedOpacity)} 보정 권장)`
          : "";
      const severity: DccRiskSeverity =
        oklabMeanDeltaE >= 0.08 || oklabMaxDeltaE >= 0.32 ? "blocker" : "warning";

      risks.push({
        layerId: node.layerId,
        layerNameKo: node.nameKo,
        code: "blend-mode-approximated",
        severity,
        messageKo: `「${node.nameKo}」의 ${BLEND_MODE_LABEL_KO[node.blendMode]} 모드가 ${targetProfile.shortLabel}에 없어 ${BLEND_MODE_LABEL_KO[targetBlendMode]}로 근사 변환됩니다 (평균 OKLab ΔE ${oklabMeanDeltaE.toFixed(4)})${opacityNote}.`,
        mitigationKo:
          recommendedOpacity !== safeOpacity
            ? `타깃 파일에서 블렌드모드를 ${BLEND_MODE_LABEL_KO[targetBlendMode]}로 바꾸고 불투명도를 ${formatOpacityPercent(recommendedOpacity)}로 맞추세요.`
            : "타깃 파일에서 하이라이트 포화도를 육안 검수하고 필요 시 광원 패스를 별도 PNG로 분리하세요.",
        measuredDeltaE: oklabMeanDeltaE,
      });
    }

    rasterizationForced = appendNonBlendLayerRisks(
      node,
      sourceDcc,
      targetProfile,
      targetBitDepth,
      risks,
    );
  }

  const slotIndex = flattened.length;
  const translatedChildren: TranslatedLayerAuditItem[] = [];
  flattened.push({
    layerId: node.layerId,
    nameKo: node.nameKo,
    layerKind: node.layerKind,
    visible,
    clippingMask: Boolean(node.clippingMask),
    sourceBitDepth: node.bitDepth,
    targetBitDepth,
    depth,
    parentLayerId,
    sourceBlendMode: node.blendMode,
    targetBlendMode,
    sourceOpacity: safeOpacity,
    recommendedOpacity,
    blendMappingStatus,
    isLayerLossless: blendMappingStatus === "exact-match" && risks.length === 0,
    rasterizationForced,
    oklabMeanDeltaE,
    oklabMaxDeltaE,
    uncompensatedMeanDeltaE,
    approximationAlternatives,
    risks,
    children: translatedChildren,
  });

  if (node.children && node.children.length > 0) {
    for (let i = 0; i < node.children.length; i += 1) {
      translatedChildren.push(
        translateSingleLayerRecursive(
          node.children[i],
          depth + 1,
          node.layerId,
          sourceDcc,
          targetDcc,
          targetProfile,
          sameDccTransfer,
          flattened,
        ),
      );
    }
  }
  return flattened[slotIndex];
}

/**
 * 웹툰 레이어 트리를 소스 DCC에서 타깃 DCC로 변환하기 전
 * 블렌드모드 근사·OKLab ΔE·래스터화·색심도·통과 폴더 위험을 사전 감사한다.
 */
export function translateDccLayerTree(
  input: TranslateDccLayerTreeInput,
): DccLayerTranslationAuditResult {
  const sourceProfile = getDccCapabilityProfile(input.sourceDcc);
  const targetProfile = getDccCapabilityProfile(input.targetDcc);
  const sameDccTransfer = input.sourceDcc === input.targetDcc;

  const flattenedLayers: TranslatedLayerAuditItem[] = [];
  const translatedLayers: TranslatedLayerAuditItem[] = [];
  for (let i = 0; i < input.layers.length; i += 1) {
    translatedLayers.push(
      translateSingleLayerRecursive(
        input.layers[i],
        0,
        null,
        input.sourceDcc,
        input.targetDcc,
        targetProfile,
        sameDccTransfer,
        flattenedLayers,
      ),
    );
  }

  const totalLayerCount = flattenedLayers.length;
  let exactMatchLayerCount = 0;
  let approximatedBlendLayerCount = 0;
  let rasterizationRiskLayerCount = 0;
  let bitDepthBandingLayerCount = 0;
  let passThroughFlattenLayerCount = 0;
  let sumDeltaE = 0;
  let maxDocumentOklabDeltaE = 0;
  let rawPenalty = 0;

  const blockers: DccLayerRiskItem[] = [];
  const warnings: DccLayerRiskItem[] = [];
  const allRisks: DccLayerRiskItem[] = [];
  const riskCountByCode = buildEmptyRiskCounts();

  for (let i = 0; i < flattenedLayers.length; i += 1) {
    const layer = flattenedLayers[i];
    if (layer.isLayerLossless) exactMatchLayerCount += 1;
    if (layer.blendMappingStatus === "approximated-blend") approximatedBlendLayerCount += 1;
    if (layer.rasterizationForced) rasterizationRiskLayerCount += 1;

    sumDeltaE += layer.oklabMeanDeltaE;
    if (layer.oklabMaxDeltaE > maxDocumentOklabDeltaE) {
      maxDocumentOklabDeltaE = layer.oklabMaxDeltaE;
    }

    let hasBanding = false;
    let hasPassThrough = false;
    for (let r = 0; r < layer.risks.length; r += 1) {
      const risk = layer.risks[r];
      allRisks.push(risk);
      riskCountByCode[risk.code] += 1;
      rawPenalty += computeRiskPenalty(risk);
      if (risk.severity === "blocker") blockers.push(risk);
      else warnings.push(risk);
      if (risk.code === "bitdepth-banding-risk") hasBanding = true;
      if (risk.code === "pass-through-group-flatten-risk") hasPassThrough = true;
    }
    if (hasBanding) bitDepthBandingLayerCount += 1;
    if (hasPassThrough) passThroughFlattenLayerCount += 1;
  }

  const meanDocumentOklabDeltaE =
    totalLayerCount > 0 ? roundFixed(sumDeltaE / totalLayerCount, 6) : 0;
  const roundedMaxDeltaE = roundFixed(maxDocumentOklabDeltaE, 6);
  const isStrictLossless = allRisks.length === 0 && roundedMaxDeltaE === 0;

  let compatibilityScore = 100;
  if (!isStrictLossless) {
    const scaleFactor = totalLayerCount <= 6 ? 1 : 6 / Math.sqrt(6 * totalLayerCount);
    compatibilityScore = Math.round(clampFiniteRange(100 - rawPenalty * scaleFactor, 0, 99, 0));
  }

  let auditGrade: DccAuditGrade = "PASS";
  if (blockers.length > 0 || compatibilityScore < 60) auditGrade = "FAIL";
  else if (warnings.length > 0 || compatibilityScore < 90) auditGrade = "WARN";

  const translationManifestSha256Hex = sha256CrossDccHex(
    JSON.stringify({
      schemaVersion: "toonstudio.wave155.cross-dcc-audit.v1",
      documentId: input.documentId,
      sourceDcc: input.sourceDcc,
      targetDcc: input.targetDcc,
      compatibilityScore,
      isStrictLossless,
      meanDocumentOklabDeltaE,
      maxDocumentOklabDeltaE: roundedMaxDeltaE,
      riskCodesCount: ALL_DCC_LOSS_RISK_CODES.map((c) => riskCountByCode[c]),
      layers: flattenedLayers.map((l) => ({
        layerId: l.layerId,
        layerKind: l.layerKind,
        depth: l.depth,
        parentLayerId: l.parentLayerId,
        sourceBitDepth: l.sourceBitDepth,
        targetBitDepth: l.targetBitDepth,
        sourceBlendMode: l.sourceBlendMode,
        targetBlendMode: l.targetBlendMode,
        sourceOpacity: l.sourceOpacity,
        recommendedOpacity: l.recommendedOpacity,
        oklabMeanDeltaE: l.oklabMeanDeltaE,
        oklabMaxDeltaE: l.oklabMaxDeltaE,
        riskCodes: l.risks.map((r) => r.code),
      })),
    }),
  );

  return {
    schemaVersion: "toonstudio.wave155.cross-dcc-audit.v1",
    documentId: input.documentId,
    documentTitleKo: input.documentTitleKo,
    sourceDcc: input.sourceDcc,
    targetDcc: input.targetDcc,
    sourceProfile,
    targetProfile,
    totalLayerCount,
    exactMatchLayerCount,
    approximatedBlendLayerCount,
    rasterizationRiskLayerCount,
    bitDepthBandingLayerCount,
    passThroughFlattenLayerCount,
    meanDocumentOklabDeltaE,
    maxDocumentOklabDeltaE: roundedMaxDeltaE,
    compatibilityScore,
    isStrictLossless,
    auditGrade,
    translatedLayers,
    flattenedLayers,
    blockers,
    warnings,
    allRisks,
    riskCountByCode,
    translationManifestSha256Hex,
  };
}
