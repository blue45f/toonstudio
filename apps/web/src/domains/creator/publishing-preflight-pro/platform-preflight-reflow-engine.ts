/**
 * 6대 연재 플랫폼 프리플라이트 패키저 & 원소스 멀티포맷 자동 리플로우 엔진.
 *
 * - 단일 정본 규격은 `platform-publishing-specs.ts`에서 가져온다.
 * - 결정론적 변환: 동일 입력에 대해 항상 같은 슬라이스 계획·매니페스트·멀티포맷 결과를 산출한다.
 */

import {
  BUILTIN_FORBIDDEN_WORDS,
  BUILTIN_TYPO_DICTIONARY,
  getPlatformPublishingSpec,
  type DeliveryManifestDocument,
  type EpisodeCutInput,
  type EpisodePreflightInput,
  type MultiFormatReflowResult,
  type PlatformPreflightResult,
  type PreflightCompressionPlan,
  type PreflightIssueItem,
  type PreflightMarginViolation,
  type PreflightSlicePlanItem,
  type PreflightTextFlag,
  type PublishingPlatformId,
  type ReflowBookB6Result,
  type ReflowBookPage,
  type ReflowBookPanelSlot,
  type ReflowShortsKeyframeClip,
  type ReflowShortsTrailerResult,
  type ReflowSnsCardNewsResult,
  type ReflowSnsCardSlide,
  type TrailerCameraMotion,
} from "./platform-publishing-specs";

import { evaluateRightsBomForPreflight } from "./rights-bom-cc0-preflight";
import { findSmartCutSafeSeam } from "./smart-cut-safe-slicer";

export {
  createDefaultPreflightEpisode,
  getPlatformPublishingSpec,
  PLATFORM_PUBLISHING_SPECS,
  type EpisodeCutEyeLevelBand,
  type EpisodeCutInput,
  type PreflightRightsBomAsset,
  type PublishingPlatformId,
} from "./platform-publishing-specs";
export {
  applyCc0AssetSubstitutions,
  CC0_REPLACEMENT_CATALOG,
  createDefaultPreflightRightsBom,
  evaluateRightsBomForPreflight,
  FIVE_PLATFORM_PREFLIGHT_PRESETS,
  getUnifiedPlatformPreflightPreset,
  recommendCc0Replacement,
  runUnifiedFivePlatformPreflight,
  type Cc0ReplacementCatalogItem,
  type RightsBomPreflightAuditReport,
  type RightsBomSubstitutionRecord,
  type UnifiedFivePlatformPreflightResult,
  type UnifiedPlatformPreflightPreset,
  type UnifiedPreflightPresetId,
} from "./rights-bom-cc0-preflight";
export {
  evaluateScanlineSeamEnergy,
  findSmartCutSafeSeam,
  planSmartCutSafeSlices,
  SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX,
  type SmartCutSafeSeamResult,
  type SmartCutSafeSliceSegment,
  type SmartCutSafeSlicerPlan,
} from "./smart-cut-safe-slicer";

const BYTES_PER_MB = 1024 * 1024;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pad3(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(3, "0");
}

function computeDeterministicFingerprint(seed: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b1;
  for (let idx = 0; idx < seed.length; idx += 1) {
    const code = seed.charCodeAt(idx);
    hashA = Math.imul(hashA ^ code, 0x01000193) >>> 0;
    hashB = Math.imul(hashB ^ (code + idx), 0x85ebca6b) >>> 0;
  }
  return `pf-${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
}

function findSafeSeamOffset(
  cut: EpisodeCutInput,
  scaleRatio: number,
  sliceStartY: number,
  maxSliceHeightPx: number,
): {
  readonly endY: number;
  readonly avoidedBalloon: boolean;
  readonly avoidedEyeLevel: boolean;
  readonly seamEnergy: number;
} {
  const scaledHeight = Math.max(1, Math.round(cut.heightPx * scaleRatio));
  const seam = findSmartCutSafeSeam({
    totalHeightPx: scaledHeight,
    sliceStartY,
    targetSliceHeightPx: maxSliceHeightPx,
    maxSliceHeightPx,
    balloons: cut.balloons.map((b) => ({
      id: b.id,
      cutId: cut.cutId,
      topY: Math.round(b.y * scaleRatio),
      bottomY: Math.round((b.y + b.height) * scaleRatio),
    })),
    eyeLevelBands: (cut.eyeLevelBands ?? []).map((eye) => ({
      id: eye.id,
      cutId: cut.cutId,
      characterName: eye.characterName,
      priority: eye.priority,
      topY: Math.round(eye.topY * scaleRatio),
      bottomY: Math.round(eye.bottomY * scaleRatio),
    })),
    rowEnergyProfile: cut.rowEnergyProfile,
  });
  return {
    endY: seam.endY,
    avoidedBalloon: seam.avoidedBalloon,
    avoidedEyeLevel: seam.avoidedEyeLevel,
    seamEnergy: seam.seamEnergy,
  };
}

export function runPlatformPreflightPackage(input: EpisodePreflightInput): PlatformPreflightResult {
  const spec = getPlatformPublishingSpec(input.platformId);
  const issues: PreflightIssueItem[] = [];
  const marginViolations: PreflightMarginViolation[] = [];
  const textFlags: PreflightTextFlag[] = [];
  const slicePlan: PreflightSlicePlanItem[] = [];

  const forbiddenTerms = new Set([
    ...BUILTIN_FORBIDDEN_WORDS,
    ...(input.customForbiddenWords ?? []).map((word) => word.trim()).filter(Boolean),
  ]);

  let originalTotalBytes = 0;
  let requiresSrgbConversion = false;
  let hasUnsupportedFormat = false;
  let hasHighDpi = false;
  let globalSliceIndex = 1;

  const sortedCuts = [...input.cuts].sort((a, b) => a.order - b.order);

  for (const cut of sortedCuts) {
    originalTotalBytes += Math.max(0, cut.estimatedBytes);
    const widthAllowed = spec.allowedWidthsPx.includes(cut.widthPx);
    const targetWidthPx = widthAllowed ? cut.widthPx : spec.recommendedWidthPx;
    const scaleRatio = cut.widthPx > 0 ? targetWidthPx / cut.widthPx : 1;
    const scaledHeightPx = Math.max(1, Math.round(cut.heightPx * scaleRatio));

    if (!widthAllowed) {
      issues.push({
        code: "WIDTH_MISMATCH",
        severity: "warn",
        cutId: cut.cutId,
        messageKo: `${cut.order}컷 폭 ${cut.widthPx}px → ${spec.labelKo} 권장 폭 ${targetWidthPx}px로 리사이즈 예정`,
      });
    }

    if (cut.format !== "jpg" && cut.format !== "png") {
      hasUnsupportedFormat = true;
      issues.push({
        code: "FORMAT_UNSUPPORTED",
        severity: "error",
        cutId: cut.cutId,
        messageKo: `${cut.order}컷 파일 형식(${cut.format.toUpperCase()})은 납품 불가 — JPG/PNG 변환 필요`,
      });
    }

    if (cut.colorProfile !== spec.requiredColorProfile) {
      requiresSrgbConversion = true;
      issues.push({
        code: "COLOR_PROFILE_NON_SRGB",
        severity: spec.id === "lezhin" ? "error" : "warn",
        cutId: cut.cutId,
        messageKo: `${cut.order}컷 색공간(${cut.colorProfile})을 sRGB로 변환해야 색 틀어짐을 막습니다`,
      });
    }

    if (cut.dpi > 150) {
      hasHighDpi = true;
      issues.push({
        code: "DPI_TOO_HIGH",
        severity: "info",
        cutId: cut.cutId,
        messageKo: `${cut.order}컷 해상도 ${cut.dpi}DPI → 웹 연재 최적화 ${spec.targetDpi}DPI 권장`,
      });
    }

    for (const balloon of cut.balloons) {
      const leftMargin = balloon.x;
      const rightMargin = cut.widthPx - (balloon.x + balloon.width);
      if (leftMargin < spec.balloonSafeMarginX) {
        marginViolations.push({
          cutId: cut.cutId,
          cutOrder: cut.order,
          balloonId: balloon.id,
          edge: "left",
          actualMarginPx: Math.round(leftMargin),
          requiredMarginPx: spec.balloonSafeMarginX,
          messageKo: `${cut.order}컷 좌측 말풍선 여백 ${Math.round(leftMargin)}px (최소 ${spec.balloonSafeMarginX}px 미만)`,
        });
      }
      if (rightMargin < spec.balloonSafeMarginX) {
        marginViolations.push({
          cutId: cut.cutId,
          cutOrder: cut.order,
          balloonId: balloon.id,
          edge: "right",
          actualMarginPx: Math.round(rightMargin),
          requiredMarginPx: spec.balloonSafeMarginX,
          messageKo: `${cut.order}컷 우측 말풍선 여백 ${Math.round(rightMargin)}px (최소 ${spec.balloonSafeMarginX}px 미만)`,
        });
      }

      if (spec.writingDirection === "vertical-jp") {
        const topMargin = balloon.y;
        const bottomMargin = cut.heightPx - (balloon.y + balloon.height);
        if (topMargin < spec.verticalTextSafeMarginY) {
          marginViolations.push({
            cutId: cut.cutId,
            cutOrder: cut.order,
            balloonId: balloon.id,
            edge: "top-vertical-jp",
            actualMarginPx: Math.round(topMargin),
            requiredMarginPx: spec.verticalTextSafeMarginY,
            messageKo: `${cut.order}컷 일본 세로쓰기 상단 여백 ${Math.round(topMargin)}px (최소 ${spec.verticalTextSafeMarginY}px 미만)`,
          });
        }
        if (bottomMargin < spec.verticalTextSafeMarginY) {
          marginViolations.push({
            cutId: cut.cutId,
            cutOrder: cut.order,
            balloonId: balloon.id,
            edge: "bottom-vertical-jp",
            actualMarginPx: Math.round(bottomMargin),
            requiredMarginPx: spec.verticalTextSafeMarginY,
            messageKo: `${cut.order}컷 일본 세로쓰기 하단 여백 ${Math.round(bottomMargin)}px (최소 ${spec.verticalTextSafeMarginY}px 미만)`,
          });
        }
      }

      for (const forbidden of forbiddenTerms) {
        if (balloon.text.includes(forbidden)) {
          const isPlaceholder =
            forbidden === "TODO" || forbidden === "TBD" || forbidden === "임시대사" || forbidden === "수정필요";
          textFlags.push({
            cutId: cut.cutId,
            cutOrder: cut.order,
            balloonId: balloon.id,
            kind: isPlaceholder ? "placeholder" : "forbidden-word",
            matchedTerm: forbidden,
            suggestionKo: isPlaceholder
              ? "최종 대사로 교체 후 다시 검수하세요"
              : "플랫폼 심의 기준에 맞게 표현을 순화하세요",
            severity: "error",
          });
        }
      }
      for (const typo of BUILTIN_TYPO_DICTIONARY) {
        if (balloon.text.includes(typo.wrong)) {
          textFlags.push({
            cutId: cut.cutId,
            cutOrder: cut.order,
            balloonId: balloon.id,
            kind: "typo",
            matchedTerm: typo.wrong,
            suggestionKo: `'${typo.wrong}' → '${typo.right}' 표기를 확인하세요`,
            severity: "warn",
          });
        }
      }
    }

    if (scaledHeightPx > spec.maxSliceHeightPx) {
      issues.push({
        code: "HEIGHT_SLICE_REQUIRED",
        severity: "info",
        cutId: cut.cutId,
        messageKo: `${cut.order}컷 높이 ${scaledHeightPx}px → ${spec.maxSliceHeightPx}px 기준으로 자동 분할`,
      });
    }

    let cursorY = 0;
    while (cursorY < scaledHeightPx) {
      const { endY, avoidedBalloon, avoidedEyeLevel, seamEnergy } = findSafeSeamOffset(
        cut,
        scaleRatio,
        cursorY,
        spec.maxSliceHeightPx,
      );
      const sliceHeightPx = Math.max(1, endY - cursorY);
      const portion = sliceHeightPx / scaledHeightPx;
      const estimatedSliceBytes = Math.round(cut.estimatedBytes * portion * (widthAllowed ? 1 : scaleRatio));
      const targetFormat: "jpg" | "png" =
        cut.format === "png" && estimatedSliceBytes <= spec.maxFileSizeMb * BYTES_PER_MB * 0.7 ? "png" : "jpg";
      const fileName = `ep${pad3(input.episodeNumber)}_${pad3(globalSliceIndex)}.${targetFormat}`;

      slicePlan.push({
        sliceIndex: globalSliceIndex,
        fileName,
        sourceCutIds: [cut.cutId],
        widthPx: targetWidthPx,
        sliceHeightPx,
        startY: cursorY,
        endY,
        estimatedBytes: estimatedSliceBytes,
        targetFormat,
        targetQuality: 90,
        needsResize: !widthAllowed,
        seamAvoidedBalloon: avoidedBalloon,
        seamAvoidedEyeLevel: avoidedEyeLevel,
        seamEnergy,
      });

      globalSliceIndex += 1;
      cursorY = endY;
    }
  }

  const maxFileBytes = spec.maxFileSizeMb * BYTES_PER_MB;
  const maxEpisodeBytes = spec.maxEpisodeTotalMb * BYTES_PER_MB;
  const rawTotalSliceBytes = slicePlan.reduce((acc, slice) => acc + slice.estimatedBytes, 0);
  const oversizedSlices = slicePlan.filter((slice) => slice.estimatedBytes > maxFileBytes);
  const requiresTotalSizeReduction = rawTotalSliceBytes > maxEpisodeBytes;

  let targetJpegQuality = 90;
  let compressionRatio = 1;
  if (oversizedSlices.length > 0 || requiresTotalSizeReduction) {
    const worstSliceRatio = oversizedSlices.reduce(
      (maxRatio, slice) => Math.max(maxRatio, slice.estimatedBytes / (maxFileBytes * 0.92)),
      1,
    );
    const totalRatio = requiresTotalSizeReduction ? rawTotalSliceBytes / (maxEpisodeBytes * 0.92) : 1;
    compressionRatio = clamp(1 / Math.max(worstSliceRatio, totalRatio), 0.45, 0.92);
    targetJpegQuality = clamp(Math.round(92 * compressionRatio), 68, 86);
  }

  const adjustedSlices: PreflightSlicePlanItem[] = slicePlan.map((slice) => {
    const shouldCompress = slice.estimatedBytes > maxFileBytes || requiresTotalSizeReduction;
    const projectedBytes = shouldCompress
      ? Math.round(slice.estimatedBytes * compressionRatio)
      : slice.estimatedBytes;
    return {
      ...slice,
      targetFormat: shouldCompress ? "jpg" : slice.targetFormat,
      targetQuality: shouldCompress ? targetJpegQuality : slice.targetQuality,
      estimatedBytes: projectedBytes,
    };
  });

  if (oversizedSlices.length > 0) {
    issues.push({
      code: "FILE_SIZE_EXCEEDED",
      severity: "error",
      messageKo: `${oversizedSlices.length}개 조각이 파일당 제한(${spec.maxFileSizeMb}MB)을 초과 — JPEG 품질 ${targetJpegQuality} 압축 적용 필요`,
    });
  }
  if (requiresTotalSizeReduction) {
    issues.push({
      code: "TOTAL_SIZE_EXCEEDED",
      severity: "error",
      messageKo: `회차 총 용량 ${roundTo(rawTotalSliceBytes / BYTES_PER_MB, 2)}MB가 제한(${spec.maxEpisodeTotalMb}MB)을 초과 — 자동 압축 플랜 활성화`,
    });
  }
  if (marginViolations.length > 0) {
    issues.push({
      code: "BALLOON_SAFE_MARGIN",
      severity: "warn",
      messageKo: `말풍선 안전 여백 침범 ${marginViolations.length}건 감지`,
    });
  }
  if (textFlags.length > 0) {
    const hasTextError = textFlags.some((flag) => flag.severity === "error");
    issues.push({
      code: "FORBIDDEN_OR_TYPO",
      severity: hasTextError ? "error" : "warn",
      messageKo: `대사 금지어·임시문구·오타 ${textFlags.length}건 확인 필요`,
    });
  }
  if (input.rightsBomAssets && input.rightsBomAssets.length > 0) {
    const rightsAudit = evaluateRightsBomForPreflight(input.rightsBomAssets);
    if (rightsAudit.exportBlocked) {
      issues.push({
        code: "RIGHTS_BOM_BLOCKED",
        severity: "error",
        messageKo: rightsAudit.summaryKo,
      });
    }
  }

  const projectedTotalBytes = adjustedSlices.reduce((acc, slice) => acc + slice.estimatedBytes, 0);
  const errorCount = issues.filter((item) => item.severity === "error").length;
  const warnCount = issues.filter((item) => item.severity === "warn").length;

  const penalty =
    errorCount * 16 +
    warnCount * 6 +
    Math.min(18, marginViolations.length * 4) +
    Math.min(20, textFlags.filter((flag) => flag.severity === "error").length * 8) +
    (hasUnsupportedFormat ? 10 : 0);

  const readinessScore = clamp(100 - penalty, 0, 100);
  const status: "READY" | "NEEDS_FIX" | "BLOCKED" =
    errorCount > 0 ? "BLOCKED" : warnCount > 0 || marginViolations.length > 0 ? "NEEDS_FIX" : "READY";

  const compressionPlan: PreflightCompressionPlan = {
    originalTotalBytes,
    projectedTotalBytes,
    maxEpisodeBytes,
    maxFileBytes,
    recommendedFormat: oversizedSlices.length > 0 || requiresTotalSizeReduction || hasHighDpi ? "jpg" : "png",
    targetJpegQuality,
    targetDpi: spec.targetDpi,
    requiresSrgbConversion,
    requiresTotalSizeReduction,
    oversizedSliceCount: oversizedSlices.length,
  };

  const generatedAtIso = input.generatedAtIso ?? "2026-11-22T00:00:00.000Z";
  const fingerprintSeed = `${input.episodeId}|${spec.id}|${adjustedSlices.length}|${projectedTotalBytes}|${readinessScore}`;

  const manifest: DeliveryManifestDocument = {
    schemaVersion: "toonstudio.delivery-manifest.v1",
    generatedAtIso,
    episodeId: input.episodeId,
    seriesTitle: input.seriesTitle,
    episodeNumber: input.episodeNumber,
    platformId: spec.id,
    platformLabelKo: spec.labelKo,
    status,
    readinessScore,
    totalInputCuts: sortedCuts.length,
    totalOutputSlices: adjustedSlices.length,
    totalEstimatedBytes: projectedTotalBytes,
    compression: compressionPlan,
    slices: adjustedSlices,
    marginViolationCount: marginViolations.length,
    textFlagCount: textFlags.length,
    fingerprint: computeDeterministicFingerprint(fingerprintSeed),
  };

  return {
    spec,
    status,
    readinessScore,
    slicePlan: adjustedSlices,
    compressionPlan,
    marginViolations,
    textFlags,
    issues,
    manifest,
    manifestJson: JSON.stringify(manifest, null, 2),
  };
}

export function applyPreflightAutoFix(
  cuts: readonly EpisodeCutInput[],
  platformId: PublishingPlatformId,
): readonly EpisodeCutInput[] {
  const spec = getPlatformPublishingSpec(platformId);
  const perCutBudgetBytes = Math.max(
    180_000,
    Math.floor((spec.maxEpisodeTotalMb * BYTES_PER_MB * 0.78) / Math.max(1, cuts.length)),
  );
  const maxFileBytes = Math.floor(spec.maxFileSizeMb * BYTES_PER_MB * 0.75);

  return cuts.map((cut) => {
    const targetWidth = spec.allowedWidthsPx.includes(cut.widthPx) ? cut.widthPx : spec.recommendedWidthPx;
    const fixedBalloons = cut.balloons.map((balloon) => {
      const clampedWidth = Math.min(balloon.width, Math.max(80, targetWidth - spec.balloonSafeMarginX * 2));
      const clampedX = clamp(
        balloon.x,
        spec.balloonSafeMarginX,
        Math.max(spec.balloonSafeMarginX, targetWidth - spec.balloonSafeMarginX - clampedWidth),
      );
      const minY = spec.writingDirection === "vertical-jp" ? spec.verticalTextSafeMarginY : 16;
      const maxY = Math.max(minY, cut.heightPx - minY - balloon.height);
      const clampedY = clamp(balloon.y, minY, maxY);

      let cleanedText = balloon.text;
      for (const typo of BUILTIN_TYPO_DICTIONARY) {
        cleanedText = cleanedText.replaceAll(typo.wrong, typo.right);
      }
      for (const forbidden of BUILTIN_FORBIDDEN_WORDS) {
        if (cleanedText.includes(forbidden)) {
          cleanedText = cleanedText.replaceAll(forbidden, "검수 완료 대사");
        }
      }

      return {
        ...balloon,
        x: Math.round(clampedX),
        y: Math.round(clampedY),
        width: Math.round(clampedWidth),
        text: cleanedText,
      };
    });

    return {
      ...cut,
      widthPx: targetWidth,
      format: "jpg",
      colorProfile: "sRGB",
      dpi: spec.targetDpi,
      estimatedBytes: Math.min(cut.estimatedBytes, perCutBudgetBytes, maxFileBytes),
      balloons: fixedBalloons,
    };
  });
}

function partitionCutsForBookPages(cuts: readonly EpisodeCutInput[]): readonly (readonly EpisodeCutInput[])[] {
  if (cuts.length === 0) return [];
  const groups: EpisodeCutInput[][] = [];
  let cursor = 0;

  while (cursor < cuts.length) {
    const remaining = cuts.length - cursor;
    if (remaining <= 6) {
      groups.push(cuts.slice(cursor));
      break;
    }

    const lookahead = cuts.slice(cursor, cursor + 5);
    const hasHighDrama = lookahead.some((cut) => cut.emotionIntensity >= 84 || cut.heightPx >= 1800);
    let desiredCount = hasHighDrama ? 4 : 5;
    if (remaining >= 12 && !hasHighDrama && cursor % 2 === 1) {
      desiredCount = 6;
    }

    const leftAfter = remaining - desiredCount;
    if (leftAfter > 0 && leftAfter < 4) {
      desiredCount = Math.max(4, Math.ceil(remaining / 2));
    }

    groups.push(cuts.slice(cursor, cursor + desiredCount));
    cursor += desiredCount;
  }

  return groups;
}

function buildBookPageSlots(
  pageCuts: readonly EpisodeCutInput[],
  side: "right" | "left",
): readonly ReflowBookPanelSlot[] {
  const trimWidthMm = 128;
  const trimHeightMm = 182;
  const innerMargin = 18;
  const outerMargin = 10;
  const topBottom = 12;
  const gutter = 3;

  const contentLeft = side === "right" ? innerMargin : outerMargin;
  const contentWidth = trimWidthMm - innerMargin - outerMargin;
  const contentHeight = trimHeightMm - topBottom * 2;
  const rowCount = pageCuts.length <= 4 ? 2 : 3;
  const rowHeight = roundTo((contentHeight - gutter * (rowCount - 1)) / rowCount, 1);

  const slots: ReflowBookPanelSlot[] = [];
  let index = 0;
  for (let row = 0; row < rowCount && index < pageCuts.length; row += 1) {
    const remainingRows = rowCount - row;
    const remainingCuts = pageCuts.length - index;
    const colsInRow = Math.min(2, Math.max(1, Math.ceil(remainingCuts / remainingRows)));
    const cellWidth = roundTo((contentWidth - gutter * (colsInRow - 1)) / colsInRow, 1);
    const yMm = roundTo(topBottom + row * (rowHeight + gutter), 1);

    for (let col = 0; col < colsInRow && index < pageCuts.length; col += 1) {
      const rtlCol = colsInRow - 1 - col;
      const xMm = roundTo(contentLeft + rtlCol * (cellWidth + gutter), 1);
      const cut = pageCuts[index]!;
      slots.push({
        cutId: cut.cutId,
        cutOrder: cut.order,
        readingOrderRtl: index + 1,
        xMm,
        yMm,
        widthMm: cellWidth,
        heightMm: rowHeight,
      });
      index += 1;
    }
  }
  return slots;
}

function computeHighlightScore(cut: EpisodeCutInput): number {
  const base = cut.emotionIntensity * 0.55 + cut.actionIntensity * 0.45 + (cut.isKeyBeat ? 20 : 0);
  const dialogueBonus = cut.balloons.length > 0 && cut.balloons[0]!.text.length <= 28 ? 6 : 0;
  return roundTo(clamp(base + dialogueBonus, 0, 126), 1);
}

export function runMultiFormatReflow(
  episodeId: string,
  cuts: readonly EpisodeCutInput[],
): MultiFormatReflowResult {
  const sortedCuts = [...cuts].sort((a, b) => a.order - b.order);

  const pageGroups = partitionCutsForBookPages(sortedCuts);
  const pages: ReflowBookPage[] = pageGroups.map((group, idx) => {
    const side: "right" | "left" = idx % 2 === 0 ? "right" : "left";
    return {
      pageNumber: idx + 1,
      side,
      trimWidthMm: 128,
      trimHeightMm: 182,
      innerBindingMarginMm: 18,
      outerMarginMm: 10,
      topBottomMarginMm: 12,
      bleedMm: 3,
      panels: buildBookPageSlots(group, side),
    };
  });
  const panelCounts = pages.map((page) => page.panels.length);
  const preservedCutCount = pages.reduce((sum, page) => sum + page.panels.length, 0);

  const bookB6: ReflowBookB6Result = {
    formatLabelKo: "일본 단행본 B6 가로 페이지",
    trimSpec: "B6 128×182mm (300DPI, 제본 여백 18mm)",
    readingDirection: "RTL",
    totalPages: pages.length,
    minCutsPerPage: panelCounts.length > 0 ? Math.min(...panelCounts) : 0,
    maxCutsPerPage: panelCounts.length > 0 ? Math.max(...panelCounts) : 0,
    preservedCutCount,
    sourceCutCount: sortedCuts.length,
    pages,
  };

  const targetClipCount = Math.min(8, sortedCuts.length);
  const rankedForTrailer = [...sortedCuts]
    .map((cut) => ({ cut, score: computeHighlightScore(cut) }))
    .sort((a, b) => b.score - a.score || a.cut.order - b.cut.order)
    .slice(0, targetClipCount)
    .sort((a, b) => a.cut.order - b.cut.order);

  const clipDurationSec = targetClipCount > 0 ? roundTo(30 / targetClipCount, 2) : 0;
  const motions: readonly TrailerCameraMotion[] = ["zoom-in", "pan-up", "dramatic-push", "pan-across"];
  const motionVectors: Record<
    TrailerCameraMotion,
    { sScale: number; eScale: number; sX: number; eX: number; sY: number; eY: number }
  > = {
    "zoom-in": { sScale: 1.0, eScale: 1.18, sX: 50, eX: 50, sY: 48, eY: 44 },
    "pan-up": { sScale: 1.08, eScale: 1.1, sX: 50, eX: 50, sY: 64, eY: 36 },
    "pan-across": { sScale: 1.12, eScale: 1.12, sX: 38, eX: 62, sY: 50, eY: 50 },
    "dramatic-push": { sScale: 1.02, eScale: 1.26, sX: 50, eX: 52, sY: 52, eY: 42 },
  };

  const clips: ReflowShortsKeyframeClip[] = rankedForTrailer.map((entry, idx) => {
    const motion = motions[idx % motions.length]!;
    const vec = motionVectors[motion];
    const startTimeSec = roundTo(idx * clipDurationSec, 2);
    const endTimeSec = idx === rankedForTrailer.length - 1 ? 30 : roundTo((idx + 1) * clipDurationSec, 2);
    const subtitleText =
      entry.cut.balloons[0]?.text ?? entry.cut.caption ?? `${entry.cut.order}컷 핵심 장면`;

    return {
      clipIndex: idx + 1,
      sourceCutId: entry.cut.cutId,
      sourceCutOrder: entry.cut.order,
      highlightScore: entry.score,
      startTimeSec,
      endTimeSec,
      durationSec: roundTo(endTimeSec - startTimeSec, 2),
      cameraMotion: motion,
      startScale: vec.sScale,
      endScale: vec.eScale,
      startXPercent: vec.sX,
      endXPercent: vec.eX,
      startYPercent: vec.sY,
      endYPercent: vec.eY,
      subtitleText,
    };
  });

  const shortsTrailer: ReflowShortsTrailerResult = {
    formatLabelKo: "쇼츠·릴스·틱톡 9:16 30초 모션 예고편",
    aspectRatio: "9:16",
    resolutionPx: { width: 1080, height: 1920 },
    fps: 30,
    totalDurationSec: clips.length > 0 ? 30 : 0,
    clipCount: clips.length,
    clips,
  };

  const cardRoles = [
    "1장 · 첫 시선 후킹",
    "2장 · 사건 발단",
    "3장 · 감정 고조",
    "4장 · 핵심 클라이맥스",
    "5장 · 다음 화 유도 CTA",
  ] as const;

  const cardCount = Math.min(5, sortedCuts.length);
  const pickedCardCuts: EpisodeCutInput[] = [];
  if (cardCount > 0) {
    const bucketSize = sortedCuts.length / cardCount;
    for (let slot = 0; slot < cardCount; slot += 1) {
      const start = Math.floor(slot * bucketSize);
      const end =
        slot === cardCount - 1 ? sortedCuts.length : Math.max(start + 1, Math.floor((slot + 1) * bucketSize));
      const slice = sortedCuts.slice(start, end);
      const best = [...slice].sort(
        (a, b) => computeHighlightScore(b) - computeHighlightScore(a) || a.order - b.order,
      )[0];
      if (best) pickedCardCuts.push(best);
    }
  }

  const cards: ReflowSnsCardSlide[] = pickedCardCuts.map((cut, idx) => ({
    cardIndex: idx + 1,
    roleKo: cardRoles[idx] ?? `${idx + 1}장 · 하이라이트`,
    sourceCutId: cut.cutId,
    sourceCutOrder: cut.order,
    headline: cut.balloons[0]?.text ?? cut.caption ?? `${cut.order}컷 하이라이트`,
    cropFocusYPercent: cut.balloons[0]
      ? clamp(Math.round((cut.balloons[0].y / Math.max(1, cut.heightPx)) * 100), 20, 75)
      : 45,
    safeTextAreaPx: { x: 84, y: 760, width: 912, height: 236 },
  }));

  const snsCardNews: ReflowSnsCardNewsResult = {
    formatLabelKo: "SNS 홍보 1:1 카드뉴스",
    aspectRatio: "1:1",
    resolutionPx: { width: 1080, height: 1080 },
    cardCount: cards.length,
    cards,
  };

  return {
    sourceEpisodeId: episodeId,
    sourceCutCount: sortedCuts.length,
    bookB6,
    shortsTrailer,
    snsCardNews,
  };
}
