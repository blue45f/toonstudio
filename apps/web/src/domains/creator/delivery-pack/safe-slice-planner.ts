/**
 * 웹툰 화수 자동 슬라이스 · 안전 절단선(말풍선·얼굴 보호 구간 회피) 계산기.
 *
 * 원고 크기와 말풍선/캐릭터 얼굴 보호 영역을 입력받아 선택한 플랫폼 규격에 맞춰
 * 비율 유지 리사이즈 후 최대 조각 높이를 절대 초과하지 않는 안전 절단선과
 * 표준 파일명(`EP01_001.jpg`), 조각별·화수 총 용량 적합성을 결정적으로 계산한다.
 */

import {
  deliveryFormatMimeType,
  formatEpisodeCode,
  formatEpisodeSliceFileName,
  getDeliveryPlatformSpec,
  resolveDeliveryFormat,
  type DeliveryImageFormat,
  type DeliveryPlatformId,
  type DeliveryPlatformSpec,
} from "./platform-delivery-specs";

export type DeliveryProtectedZoneKind =
  | "speech-bubble"
  | "character-face"
  | "sfx-text"
  | "panel-key-art";

export interface DeliveryProtectedZone {
  readonly id: string;
  readonly kind: DeliveryProtectedZoneKind;
  readonly label?: string;
  /** 원본 캔버스 좌표계 기준 시작 Y(px) */
  readonly topY: number;
  /** 원본 캔버스 좌표계 기준 끝 Y(px) */
  readonly bottomY: number;
  /** 보호 구간 위아래 추가 안전 여백(목표 좌표계 px, 미지정 시 플랫폼 기본값 사용) */
  readonly paddingPx?: number;
}

export interface EpisodeSliceInput {
  readonly episodeNumber: number;
  readonly episodeTitle?: string;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly protectedZones?: readonly DeliveryProtectedZone[];
  /** 실제 인코딩된 조각 바이트 크기(있으면 추정치 대신 실측값으로 용량 한도를 검사한다) */
  readonly actualSliceBytes?: readonly number[];
  /** 바이트 추정 계수(bytes/px, 미지정 시 포맷별 기본값 적용) */
  readonly estimatedBytesPerPixel?: number;
}

export interface PlannedDeliverySlice {
  readonly index: number;
  readonly fileName: string;
  readonly zipPath: string;
  readonly mimeType: "image/jpeg" | "image/png";
  readonly widthPx: number;
  readonly heightPx: number;
  /** 목표 플랫폼 좌표계 기준 Y 구간 [yStartPx, yEndPx) */
  readonly yStartPx: number;
  readonly yEndPx: number;
  /** 원본 캔버스 좌표계 기준 Y 구간 [sourceYStartPx, sourceYEndPx) */
  readonly sourceYStartPx: number;
  readonly sourceYEndPx: number;
  readonly estimatedBytes: number;
  readonly byteSource: "measured" | "estimated";
  readonly exceedsSliceByteLimit: boolean;
  readonly cutReason: "end-of-episode" | "max-height" | "avoided-protected-zone" | "forced-max-height";
  readonly adjusted: boolean;
  readonly avoidedZoneIds: readonly string[];
  readonly avoidedZoneKinds: readonly DeliveryProtectedZoneKind[];
  readonly splitZoneIds: readonly string[];
}

export type EpisodeSliceDiagnosticCode =
  | "INVALID_EPISODE_NUMBER"
  | "INVALID_DIMENSIONS"
  | "DUPLICATE_EPISODE_NUMBER"
  | "SLICE_COUNT_LIMIT_EXCEEDED"
  | "SLICE_BYTE_LIMIT_EXCEEDED"
  | "EPISODE_BYTE_LIMIT_EXCEEDED"
  | "SLICE_ADJUSTED_FOR_PROTECTED_ZONE"
  | "SLICE_FORCED_THROUGH_PROTECTED_ZONE"
  | "SOURCE_WIDTH_UPSCALED";

export interface EpisodeSliceDiagnostic {
  readonly code: EpisodeSliceDiagnosticCode;
  readonly severity: "blocker" | "warning" | "info";
  readonly episodeNumber: number;
  readonly sliceIndex?: number;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface EpisodeSlicePlan {
  readonly platformId: DeliveryPlatformId;
  readonly platformSpec: DeliveryPlatformSpec;
  readonly format: DeliveryImageFormat;
  readonly episodeNumber: number;
  readonly episodeCode: string;
  readonly episodeTitle: string;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly targetWidthPx: number;
  readonly scaledHeightPx: number;
  readonly scaleRatio: number;
  readonly sliceCount: number;
  readonly adjustedCutCount: number;
  readonly forcedCutCount: number;
  readonly estimatedTotalBytes: number;
  readonly byteSource: "measured" | "estimated";
  readonly withinByteBudget: boolean;
  readonly withinSliceCountLimit: boolean;
  readonly valid: boolean;
  readonly slices: readonly PlannedDeliverySlice[];
  readonly diagnostics: readonly EpisodeSliceDiagnostic[];
}

export interface BatchEpisodeDeliveryPlan {
  readonly platformId: DeliveryPlatformId;
  readonly platformSpec: DeliveryPlatformSpec;
  readonly format: DeliveryImageFormat;
  readonly episodeCount: number;
  readonly totalSliceCount: number;
  readonly totalAdjustedCutCount: number;
  readonly totalEstimatedBytes: number;
  readonly valid: boolean;
  readonly episodes: readonly EpisodeSlicePlan[];
  readonly diagnostics: readonly EpisodeSliceDiagnostic[];
}

interface MergedProtectedBand {
  readonly safeTopY: number;
  readonly safeBottomY: number;
  readonly zoneIds: readonly string[];
  readonly kinds: readonly DeliveryProtectedZoneKind[];
}

const DEFAULT_BYTES_PER_PIXEL: Readonly<Record<DeliveryImageFormat, number>> = Object.freeze({
  jpg: 0.28,
  png: 0.85,
});

const DEFAULT_MIN_SLICE_HEIGHT_PX = 120;

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function buildMergedProtectedBands(
  zones: readonly DeliveryProtectedZone[],
  scaleRatio: number,
  scaledTotalHeightPx: number,
  defaultMarginPx: number,
): readonly MergedProtectedBand[] {
  if (zones.length === 0 || scaledTotalHeightPx <= 0) return Object.freeze([]);

  const rawBands = zones
    .filter((zone) => Number.isFinite(zone.topY) && Number.isFinite(zone.bottomY) && zone.bottomY > zone.topY)
    .map((zone) => {
      const margin =
        zone.paddingPx !== undefined && Number.isFinite(zone.paddingPx) && zone.paddingPx >= 0
          ? zone.paddingPx
          : defaultMarginPx;
      const safeTopY = Math.max(0, Math.floor(zone.topY * scaleRatio - margin));
      const safeBottomY = Math.min(scaledTotalHeightPx, Math.ceil(zone.bottomY * scaleRatio + margin));
      return {
        safeTopY,
        safeBottomY,
        zoneIds: [zone.id],
        kinds: [zone.kind],
      };
    })
    .filter((band) => band.safeBottomY > band.safeTopY)
    .sort((left, right) => left.safeTopY - right.safeTopY || left.safeBottomY - right.safeBottomY);

  const firstBand = rawBands[0];
  if (!firstBand) return Object.freeze([]);

  const merged: {
    safeTopY: number;
    safeBottomY: number;
    zoneIds: string[];
    kinds: DeliveryProtectedZoneKind[];
  }[] = [firstBand];

  for (let i = 1; i < rawBands.length; i += 1) {
    const current = rawBands[i];
    const prev = merged[merged.length - 1];
    if (!current || !prev) continue;
    if (current.safeTopY <= prev.safeBottomY) {
      prev.safeBottomY = Math.max(prev.safeBottomY, current.safeBottomY);
      for (const id of current.zoneIds) {
        if (!prev.zoneIds.includes(id)) prev.zoneIds.push(id);
      }
      for (const kind of current.kinds) {
        if (!prev.kinds.includes(kind)) prev.kinds.push(kind);
      }
    } else {
      merged.push(current);
    }
  }

  return Object.freeze(
    merged.map((band) =>
      Object.freeze({
        safeTopY: band.safeTopY,
        safeBottomY: band.safeBottomY,
        zoneIds: Object.freeze(band.zoneIds),
        kinds: Object.freeze(band.kinds),
      }),
    ),
  );
}

function estimateSliceBytes(
  widthPx: number,
  heightPx: number,
  format: DeliveryImageFormat,
  overrideBytesPerPixel?: number,
): number {
  const bpp =
    overrideBytesPerPixel !== undefined && Number.isFinite(overrideBytesPerPixel) && overrideBytesPerPixel > 0
      ? overrideBytesPerPixel
      : DEFAULT_BYTES_PER_PIXEL[format];
  return Math.max(1024, Math.round(widthPx * heightPx * bpp));
}

export interface PlanEpisodeSlicesOptions {
  readonly platformId: DeliveryPlatformId;
  readonly format?: DeliveryImageFormat;
  readonly minSliceHeightPx?: number;
  readonly directoryPrefix?: string;
}

/**
 * 단일 화수 원고를 대상 플랫폼 규격으로 안전 분할하고 파일명·용량 예산을 계산한다.
 */
export function planEpisodeSlices(
  episode: EpisodeSliceInput,
  options: PlanEpisodeSlicesOptions,
): EpisodeSlicePlan {
  const spec = getDeliveryPlatformSpec(options.platformId);
  const format = resolveDeliveryFormat(options.platformId, options.format);
  const mimeType = deliveryFormatMimeType(format);
  const diagnostics: EpisodeSliceDiagnostic[] = [];

  const validEpisodeNumber = Number.isSafeInteger(episode.episodeNumber) && episode.episodeNumber >= 1;
  const safeEpisodeNum = validEpisodeNumber ? episode.episodeNumber : 1;
  const episodeCode = formatEpisodeCode(safeEpisodeNum);
  const episodeTitle = episode.episodeTitle?.trim() || `${safeEpisodeNum}화`;

  if (!validEpisodeNumber) {
    diagnostics.push(
      Object.freeze({
        code: "INVALID_EPISODE_NUMBER",
        severity: "blocker",
        episodeNumber: episode.episodeNumber,
        messageKo: "화수 번호는 1 이상의 정수여야 합니다.",
        messageEn: "Episode number must be a positive integer.",
      }),
    );
  }

  const validDimensions =
    Number.isFinite(episode.sourceWidthPx) &&
    Number.isFinite(episode.sourceHeightPx) &&
    episode.sourceWidthPx > 0 &&
    episode.sourceHeightPx > 0;

  if (!validDimensions) {
    diagnostics.push(
      Object.freeze({
        code: "INVALID_DIMENSIONS",
        severity: "blocker",
        episodeNumber: safeEpisodeNum,
        messageKo: `${episodeCode} 원고 가로·세로 크기는 1px 이상이어야 합니다.`,
        messageEn: `${episodeCode} source dimensions must be positive.`,
      }),
    );
    return Object.freeze({
      platformId: options.platformId,
      platformSpec: spec,
      format,
      episodeNumber: episode.episodeNumber,
      episodeCode,
      episodeTitle,
      sourceWidthPx: episode.sourceWidthPx,
      sourceHeightPx: episode.sourceHeightPx,
      targetWidthPx: spec.targetWidthPx,
      scaledHeightPx: 0,
      scaleRatio: 0,
      sliceCount: 0,
      adjustedCutCount: 0,
      forcedCutCount: 0,
      estimatedTotalBytes: 0,
      byteSource: "estimated",
      withinByteBudget: false,
      withinSliceCountLimit: false,
      valid: false,
      slices: Object.freeze([]),
      diagnostics: Object.freeze(diagnostics),
    });
  }

  const scaleRatio = spec.targetWidthPx / episode.sourceWidthPx;
  const scaledHeightPx = Math.max(1, Math.round(episode.sourceHeightPx * scaleRatio));

  if (episode.sourceWidthPx < spec.targetWidthPx) {
    diagnostics.push(
      Object.freeze({
        code: "SOURCE_WIDTH_UPSCALED",
        severity: "warning",
        episodeNumber: safeEpisodeNum,
        messageKo: `${episodeCode} 원본 가로폭(${episode.sourceWidthPx}px)이 ${spec.labelKo} 납품 기준(${spec.targetWidthPx}px)보다 작아 확대 출력됩니다.`,
        messageEn: `${episodeCode} source width (${episode.sourceWidthPx}px) is smaller than ${spec.labelEn} target (${spec.targetWidthPx}px).`,
      }),
    );
  }

  const minSliceHeightPx = Math.max(
    1,
    Math.min(
      spec.maxSliceHeightPx,
      Math.round(options.minSliceHeightPx ?? DEFAULT_MIN_SLICE_HEIGHT_PX),
    ),
  );
  const bands = buildMergedProtectedBands(
    episode.protectedZones ?? [],
    scaleRatio,
    scaledHeightPx,
    spec.minSafeMarginPx,
  );

  const rawDir = (options.directoryPrefix ?? `slices/${options.platformId}/${episodeCode}`).replace(/^\/+|\/+$/gu, "");
  const slices: PlannedDeliverySlice[] = [];
  let cursorY = 0;
  let adjustedCutCount = 0;
  let forcedCutCount = 0;

  while (cursorY < scaledHeightPx) {
    const sliceIndex = slices.length + 1;
    const remaining = scaledHeightPx - cursorY;
    let nextY: number;
    let cutReason: PlannedDeliverySlice["cutReason"];
    let avoidedZoneIds: readonly string[] = Object.freeze([]);
    let avoidedZoneKinds: readonly DeliveryProtectedZoneKind[] = Object.freeze([]);
    let splitZoneIds: readonly string[] = Object.freeze([]);

    if (remaining <= spec.maxSliceHeightPx) {
      nextY = scaledHeightPx;
      cutReason = "end-of-episode";
    } else {
      const maxCutY = cursorY + spec.maxSliceHeightPx;
      const intersectedBand = bands.find(
        (band) => maxCutY > band.safeTopY && maxCutY < band.safeBottomY,
      );

      if (!intersectedBand) {
        nextY = maxCutY;
        cutReason = "max-height";
      } else if (intersectedBand.safeTopY - cursorY >= minSliceHeightPx) {
        nextY = intersectedBand.safeTopY;
        cutReason = "avoided-protected-zone";
        avoidedZoneIds = intersectedBand.zoneIds;
        avoidedZoneKinds = intersectedBand.kinds;
        adjustedCutCount += 1;
      } else {
        // 단일 보호 구간이 플랫폼 최대 조각 높이를 초과하거나 조각 시작점과 너무 가까워
        // 최대 높이 제약을 지키려면 불가피하게 절단해야 하는 경우
        nextY = maxCutY;
        cutReason = "forced-max-height";
        splitZoneIds = intersectedBand.zoneIds;
        forcedCutCount += 1;
        diagnostics.push(
          Object.freeze({
            code: "SLICE_FORCED_THROUGH_PROTECTED_ZONE",
            severity: "warning",
            episodeNumber: safeEpisodeNum,
            sliceIndex,
            messageKo: `${episodeCode} ${sliceIndex}번 조각 끝(${nextY}px)에서 보호 구간(${splitZoneIds.join(", ")})이 플랫폼 최대 높이(${spec.maxSliceHeightPx}px) 제약과 겹쳐 회피할 수 없었습니다. 컷 여백을 조정하세요.`,
            messageEn: `${episodeCode} slice #${sliceIndex} could not avoid protected zone(s) (${splitZoneIds.join(", ")}) without exceeding ${spec.maxSliceHeightPx}px.`,
          }),
        );
      }
    }

    const heightPx = nextY - cursorY;
    const fileName = formatEpisodeSliceFileName(safeEpisodeNum, sliceIndex, format);
    const zipPath = rawDir ? `${rawDir}/${fileName}` : fileName;
    const measuredByte = episode.actualSliceBytes?.[sliceIndex - 1];
    const hasMeasured =
      measuredByte !== undefined && Number.isFinite(measuredByte) && measuredByte >= 0;
    const estimatedBytes = hasMeasured
      ? Math.round(measuredByte)
      : estimateSliceBytes(spec.targetWidthPx, heightPx, format, episode.estimatedBytesPerPixel);
    const exceedsSliceByteLimit = estimatedBytes > spec.maxSliceBytes;

    if (exceedsSliceByteLimit) {
      diagnostics.push(
        Object.freeze({
          code: "SLICE_BYTE_LIMIT_EXCEEDED",
          severity: "blocker",
          episodeNumber: safeEpisodeNum,
          sliceIndex,
          messageKo: `${fileName} 예상 용량(${formatMb(estimatedBytes)})이 ${spec.labelKo} 조각당 상한(${formatMb(spec.maxSliceBytes)})을 초과합니다. JPG 압축 품질을 낮추거나 포맷을 JPG로 전환하세요.`,
          messageEn: `${fileName} (${formatMb(estimatedBytes)}) exceeds the ${spec.labelEn} per-slice limit (${formatMb(spec.maxSliceBytes)}).`,
        }),
      );
    }

    const sourceYStartPx = Math.round(cursorY / scaleRatio);
    const sourceYEndPx =
      nextY === scaledHeightPx
        ? episode.sourceHeightPx
        : Math.min(episode.sourceHeightPx, Math.round(nextY / scaleRatio));

    slices.push(
      Object.freeze({
        index: sliceIndex,
        fileName,
        zipPath,
        mimeType,
        widthPx: spec.targetWidthPx,
        heightPx,
        yStartPx: cursorY,
        yEndPx: nextY,
        sourceYStartPx,
        sourceYEndPx,
        estimatedBytes,
        byteSource: hasMeasured ? "measured" : "estimated",
        exceedsSliceByteLimit,
        cutReason,
        adjusted: cutReason === "avoided-protected-zone",
        avoidedZoneIds,
        avoidedZoneKinds,
        splitZoneIds,
      }),
    );

    cursorY = nextY;
  }

  if (adjustedCutCount > 0) {
    diagnostics.push(
      Object.freeze({
        code: "SLICE_ADJUSTED_FOR_PROTECTED_ZONE",
        severity: "info",
        episodeNumber: safeEpisodeNum,
        messageKo: `${episodeCode} 말풍선·얼굴 보호 구간을 피하기 위해 절단선 ${adjustedCutCount}곳을 안전한 여백으로 자동 이동했습니다.`,
        messageEn: `${episodeCode} shifted ${adjustedCutCount} cut line(s) to avoid speech bubbles and faces.`,
      }),
    );
  }

  const withinSliceCountLimit = slices.length <= spec.maxSliceCount;
  if (!withinSliceCountLimit) {
    diagnostics.push(
      Object.freeze({
        code: "SLICE_COUNT_LIMIT_EXCEEDED",
        severity: "blocker",
        episodeNumber: safeEpisodeNum,
        messageKo: `${episodeCode} 분할 조각 수(${slices.length}장)가 ${spec.labelKo} 최대 허용 수(${spec.maxSliceCount}장)를 초과합니다.`,
        messageEn: `${episodeCode} slice count (${slices.length}) exceeds ${spec.labelEn} max (${spec.maxSliceCount}).`,
      }),
    );
  }

  const estimatedTotalBytes = slices.reduce((sum, slice) => sum + slice.estimatedBytes, 0);
  const exceedsEpisodeBytes = estimatedTotalBytes > spec.maxEpisodeBytes;
  if (exceedsEpisodeBytes) {
    diagnostics.push(
      Object.freeze({
        code: "EPISODE_BYTE_LIMIT_EXCEEDED",
        severity: "blocker",
        episodeNumber: safeEpisodeNum,
        messageKo: `${episodeCode} 화수 총 용량(${formatMb(estimatedTotalBytes)})이 ${spec.labelKo} 상한(${formatMb(spec.maxEpisodeBytes)})을 초과합니다.`,
        messageEn: `${episodeCode} total size (${formatMb(estimatedTotalBytes)}) exceeds ${spec.labelEn} episode cap (${formatMb(spec.maxEpisodeBytes)}).`,
      }),
    );
  }

  const withinByteBudget = !exceedsEpisodeBytes && slices.every((slice) => !slice.exceedsSliceByteLimit);
  const allMeasured = slices.length > 0 && slices.every((slice) => slice.byteSource === "measured");
  const hasBlockers = diagnostics.some((item) => item.severity === "blocker");

  return Object.freeze({
    platformId: options.platformId,
    platformSpec: spec,
    format,
    episodeNumber: safeEpisodeNum,
    episodeCode,
    episodeTitle,
    sourceWidthPx: episode.sourceWidthPx,
    sourceHeightPx: episode.sourceHeightPx,
    targetWidthPx: spec.targetWidthPx,
    scaledHeightPx,
    scaleRatio,
    sliceCount: slices.length,
    adjustedCutCount,
    forcedCutCount,
    estimatedTotalBytes,
    byteSource: allMeasured ? "measured" : "estimated",
    withinByteBudget,
    withinSliceCountLimit,
    valid: !hasBlockers,
    slices: Object.freeze(slices),
    diagnostics: Object.freeze(diagnostics),
  });
}

/**
 * 여러 화수를 한 번에 대상 플랫폼 규격으로 일괄 분할 계획한다.
 */
export function planBatchEpisodeDelivery(
  episodes: readonly EpisodeSliceInput[],
  options: PlanEpisodeSlicesOptions,
): BatchEpisodeDeliveryPlan {
  const spec = getDeliveryPlatformSpec(options.platformId);
  const format = resolveDeliveryFormat(options.platformId, options.format);
  const sorted = [...episodes].sort((left, right) => left.episodeNumber - right.episodeNumber);
  const plannedEpisodes = sorted.map((episode) => planEpisodeSlices(episode, options));
  const diagnostics: EpisodeSliceDiagnostic[] = [];

  const seenNumbers = new Set<number>();
  for (const episode of sorted) {
    if (seenNumbers.has(episode.episodeNumber)) {
      diagnostics.push(
        Object.freeze({
          code: "DUPLICATE_EPISODE_NUMBER",
          severity: "blocker",
          episodeNumber: episode.episodeNumber,
          messageKo: `화수 번호 ${episode.episodeNumber}화가 중복 입력되어 일괄 납품 파일명이 충돌합니다.`,
          messageEn: `Duplicate episode number ${episode.episodeNumber} causes filename collisions.`,
        }),
      );
    } else {
      seenNumbers.add(episode.episodeNumber);
    }
  }

  for (const plan of plannedEpisodes) {
    diagnostics.push(...plan.diagnostics);
  }

  const totalSliceCount = plannedEpisodes.reduce((sum, item) => sum + item.sliceCount, 0);
  const totalAdjustedCutCount = plannedEpisodes.reduce((sum, item) => sum + item.adjustedCutCount, 0);
  const totalEstimatedBytes = plannedEpisodes.reduce((sum, item) => sum + item.estimatedTotalBytes, 0);
  const valid =
    plannedEpisodes.length > 0 &&
    plannedEpisodes.every((item) => item.valid) &&
    !diagnostics.some((item) => item.severity === "blocker");

  return Object.freeze({
    platformId: options.platformId,
    platformSpec: spec,
    format,
    episodeCount: plannedEpisodes.length,
    totalSliceCount,
    totalAdjustedCutCount,
    totalEstimatedBytes,
    valid,
    episodes: Object.freeze(plannedEpisodes),
    diagnostics: Object.freeze(diagnostics),
  });
}
