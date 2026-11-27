/**
 * Wave 49: 연재 플랫폼 출고 규격 프리셋 및 안전 슬라이스 절단선(Safe Slice Seam) 플래너.
 *
 * - 네이버 웹툰(690px/800px, 단일 슬라이스 상한 1280~1600px), 카카오페이지/카카오웹툰(720px/1080px),
 *   글로벌 세로 스크롤(800px, 영문 대사 여백), 단행본 인쇄(300 DPI, 재단 여백 3mm) 규격을 검증한다.
 * - 대사 말풍선·캐릭터 얼굴·효과음 보호 영역을 침범하지 않고 컷 사이 여백(Gutter) 중앙을 우선 선택해
 *   안전 슬라이스 절단선을 자동 산출한다.
 */

export type PlatformDeliveryPresetId =
  | "naver-webtoon-standard"
  | "naver-webtoon-hd"
  | "kakao-page-standard"
  | "kakao-webtoon-hd"
  | "global-vertical-scroll"
  | "print-tankobon-300dpi";

export type DeliveryImageFormat = "jpeg" | "png" | "webp" | "tiff" | "pdf";
export type DeliveryColorSpace = "srgb" | "cmyk";
export type ProtectedZoneKind = "face" | "dialogue" | "sfx" | "key-art";
export type DeliveryIssueSeverity = "error" | "warning";

export interface PlatformDeliverySpec {
  readonly id: PlatformDeliveryPresetId;
  readonly nameKo: string;
  readonly recommendedWidthPx: number;
  readonly allowedWidthsPx: readonly number[];
  readonly requiresSlicing: boolean;
  readonly minSliceHeightPx: number;
  readonly recommendedSliceHeightPx: number;
  readonly maxSliceHeightPx: number;
  readonly maxSingleFileBytes: number;
  readonly maxTotalEpisodeBytes: number;
  readonly allowedFormats: readonly DeliveryImageFormat[];
  readonly defaultFormat: DeliveryImageFormat;
  readonly requiredColorSpace: DeliveryColorSpace;
  readonly minDpi: number;
  readonly bleedMarginMm: number;
  readonly horizontalSafeMarginPx: number;
  readonly englishBubblePaddingPx: number;
}

export interface DeliverySpecCheckInput {
  readonly presetId: PlatformDeliveryPresetId;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly format: DeliveryImageFormat;
  readonly dpi?: number;
  readonly bleedMm?: number;
  readonly colorSpace?: DeliveryColorSpace;
  readonly sliceHeightsPx?: readonly number[];
  readonly sliceByteSizes?: readonly number[];
  readonly estimatedTotalBytes?: number;
  readonly englishBubblePaddingPx?: number;
}

export type DeliverySpecIssueCode =
  | "width-mismatch"
  | "format-unsupported"
  | "dpi-too-low"
  | "bleed-margin-short"
  | "color-space-mismatch"
  | "slice-height-exceeded"
  | "single-file-size-exceeded"
  | "total-episode-size-exceeded"
  | "english-bubble-margin-tight";

export interface DeliverySpecIssue {
  readonly code: DeliverySpecIssueCode;
  readonly severity: DeliveryIssueSeverity;
  readonly messageKo: string;
  readonly actual: string;
  readonly expected: string;
  readonly suggestedFixKo: string;
}

export interface DeliverySpecValidationReport {
  readonly preset: PlatformDeliverySpec;
  readonly passed: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly requiredBleedPx: number;
  readonly issues: readonly DeliverySpecIssue[];
}

export interface ProtectedCutZone {
  readonly id: string;
  readonly kind: ProtectedZoneKind;
  readonly topY: number;
  readonly bottomY: number;
  readonly labelKo?: string;
  readonly paddingPx?: number;
}

export interface VerticalGutterBand {
  readonly topY: number;
  readonly bottomY: number;
}

export interface SafeSlicePlanInput {
  readonly presetId: PlatformDeliveryPresetId;
  readonly canvasHeightPx: number;
  readonly preferredSliceHeightPx?: number;
  readonly maxSliceHeightPx?: number;
  readonly minSliceHeightPx?: number;
  readonly protectedZones: readonly ProtectedCutZone[];
  readonly gutterBands?: readonly VerticalGutterBand[];
}

export interface PlannedSliceSeam {
  readonly seamIndex: number;
  readonly y: number;
  readonly idealY: number;
  readonly shiftedByPx: number;
  readonly insideGutter: boolean;
  readonly avoidedZoneIds: readonly string[];
  readonly unavoidableConflictZoneIds: readonly string[];
  readonly reasonKo: string;
}

export interface PlannedSliceSegment {
  readonly index: number;
  readonly startY: number;
  readonly endY: number;
  readonly heightPx: number;
  readonly exceedsMaxHeight: boolean;
}

export interface SafeSlicePlanResult {
  readonly presetId: PlatformDeliveryPresetId;
  readonly totalHeightPx: number;
  readonly sliceCount: number;
  readonly cutYPositions: readonly number[];
  readonly seams: readonly PlannedSliceSeam[];
  readonly slices: readonly PlannedSliceSegment[];
  readonly unavoidableConflictCount: number;
  readonly allSeamsSafe: boolean;
  readonly summaryKo: string;
}

const MB = 1024 * 1024;
const MM_PER_INCH = 25.4;
const DEFAULT_ZONE_PADDING_PX: Readonly<Record<ProtectedZoneKind, number>> = {
  face: 14, dialogue: 10, sfx: 8, "key-art": 6,
};
const ZONE_PRIORITY_WEIGHT: Readonly<Record<ProtectedZoneKind, number>> = {
  face: 100, dialogue: 95, sfx: 60, "key-art": 40,
};

function makeWebtoonPreset(
  id: PlatformDeliveryPresetId, nameKo: string, recommendedWidthPx: number,
  allowedWidthsPx: readonly number[], minSliceHeightPx: number, recommendedSliceHeightPx: number,
  maxSliceHeightPx: number, maxSingleMb: number, maxTotalMb: number,
  horizontalSafeMarginPx: number, englishBubblePaddingPx = 0,
): PlatformDeliverySpec {
  return {
    id, nameKo, recommendedWidthPx, allowedWidthsPx, requiresSlicing: true,
    minSliceHeightPx, recommendedSliceHeightPx, maxSliceHeightPx,
    maxSingleFileBytes: maxSingleMb * MB, maxTotalEpisodeBytes: maxTotalMb * MB,
    allowedFormats: ["jpeg", "png"], defaultFormat: "jpeg", requiredColorSpace: "srgb",
    minDpi: 72, bleedMarginMm: 0, horizontalSafeMarginPx, englishBubblePaddingPx,
  };
}

export const PLATFORM_DELIVERY_PRESETS: Readonly<
  Record<PlatformDeliveryPresetId, PlatformDeliverySpec>
> = {
  "naver-webtoon-standard": makeWebtoonPreset(
    "naver-webtoon-standard", "네이버 웹툰 기본 (690px)", 690, [690, 800], 320, 1280, 1600, 2, 20, 24,
  ),
  "naver-webtoon-hd": makeWebtoonPreset(
    "naver-webtoon-hd", "네이버 웹툰 고해상도 (800px)", 800, [690, 800], 320, 1280, 1600, 2, 20, 28,
  ),
  "kakao-page-standard": makeWebtoonPreset(
    "kakao-page-standard", "카카오페이지·웹툰 기본 (720px)", 720, [720, 1080], 360, 1280, 1500, 2, 30, 28,
  ),
  "kakao-webtoon-hd": makeWebtoonPreset(
    "kakao-webtoon-hd", "카카오웹툰 고해상도 (1080px)", 1080, [720, 1080], 400, 1440, 1600, 3, 40, 40,
  ),
  "global-vertical-scroll": makeWebtoonPreset(
    "global-vertical-scroll", "글로벌 세로 스크롤 (800px·영문 대사)", 800, [800], 320, 1280, 1280, 2, 20, 44, 14,
  ),
  "print-tankobon-300dpi": {
    id: "print-tankobon-300dpi", nameKo: "단행본·인쇄 출고 (300 DPI·재단 3mm)",
    recommendedWidthPx: 1748, allowedWidthsPx: [1512, 1748, 2150, 2480],
    requiresSlicing: false, minSliceHeightPx: 1000, recommendedSliceHeightPx: 2480,
    maxSliceHeightPx: 3508, maxSingleFileBytes: 50 * MB, maxTotalEpisodeBytes: 300 * MB,
    allowedFormats: ["tiff", "pdf", "png"], defaultFormat: "pdf", requiredColorSpace: "cmyk",
    minDpi: 300, bleedMarginMm: 3, horizontalSafeMarginPx: 119, englishBubblePaddingPx: 0,
  },
};

/** 밀리미터 단위 재단·안전 여백을 지정 DPI 기준 정수 픽셀(올림)로 환산한다. */
export function mmToPixelsAtDpi(mm: number, dpi: number): number {
  if (!Number.isFinite(mm) || mm <= 0 || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return Math.ceil((mm / MM_PER_INCH) * dpi);
}

/** 프리셋 식별자에 해당하는 출고 규격을 반환한다. */
export function getPlatformDeliveryPreset(id: PlatformDeliveryPresetId): PlatformDeliverySpec {
  return PLATFORM_DELIVERY_PRESETS[id];
}

/** 지원 중인 전체 연재·인쇄 출고 규격 목록을 반환한다. */
export function listPlatformDeliveryPresets(): readonly PlatformDeliverySpec[] {
  return Object.values(PLATFORM_DELIVERY_PRESETS);
}

function formatMb(bytes: number): string {
  return `${(bytes / MB).toFixed(2)}MB`;
}

/** 원고 메타데이터와 슬라이스 정보를 선택한 플랫폼 출고 규격에 대조해 검증한다. */
export function validateDeliveryAgainstSpec(
  input: DeliverySpecCheckInput,
): DeliverySpecValidationReport {
  const preset = PLATFORM_DELIVERY_PRESETS[input.presetId];
  const issues: DeliverySpecIssue[] = [];
  const dpi = input.dpi ?? 72;
  const bleedMm = input.bleedMm ?? 0;
  const colorSpace = input.colorSpace ?? "srgb";
  const requiredBleedPx = mmToPixelsAtDpi(preset.bleedMarginMm, preset.minDpi);
  const add = (
    code: DeliverySpecIssueCode, severity: DeliveryIssueSeverity,
    messageKo: string, actual: string, expected: string, suggestedFixKo: string,
  ): void => {
    issues.push({ code, severity, messageKo, actual, expected, suggestedFixKo });
  };

  if (!preset.allowedWidthsPx.includes(input.canvasWidthPx)) {
    add("width-mismatch", "error", `${preset.nameKo} 허용 가로폭과 다릅니다.`,
      `${input.canvasWidthPx}px`, `${preset.allowedWidthsPx.join("px 또는 ")}px`,
      `가로폭을 ${preset.recommendedWidthPx}px로 리샘플링해 출고하세요.`);
  }
  if (!preset.allowedFormats.includes(input.format)) {
    add("format-unsupported", "error", `${preset.nameKo}에서 지원하지 않는 파일 포맷입니다.`,
      input.format.toUpperCase(), preset.allowedFormats.map((f) => f.toUpperCase()).join(", "),
      `출고 포맷을 ${preset.defaultFormat.toUpperCase()}로 변경하세요.`);
  }
  if (dpi < preset.minDpi) {
    add("dpi-too-low", "error", `해상도가 출고 기준(${preset.minDpi} DPI)보다 낮습니다.`,
      `${dpi} DPI`, `>= ${preset.minDpi} DPI`,
      `원고 출력 해상도를 ${preset.minDpi} DPI 이상으로 높이세요.`);
  }
  if (preset.bleedMarginMm > 0 && bleedMm < preset.bleedMarginMm) {
    add("bleed-margin-short", "error", `인쇄 재단 여백이 기준(${preset.bleedMarginMm}mm)에 미달합니다.`,
      `${bleedMm}mm`, `>= ${preset.bleedMarginMm}mm (${requiredBleedPx}px @ ${preset.minDpi} DPI)`,
      `사방 재단 여백을 ${preset.bleedMarginMm}mm(${requiredBleedPx}px) 이상 확보하세요.`);
  }
  if (colorSpace !== preset.requiredColorSpace) {
    add("color-space-mismatch", preset.requiredColorSpace === "cmyk" ? "error" : "warning",
      `색공간이 출고 기준(${preset.requiredColorSpace.toUpperCase()})과 다릅니다.`,
      colorSpace.toUpperCase(), preset.requiredColorSpace.toUpperCase(),
      `출고 파이프라인에서 ${preset.requiredColorSpace.toUpperCase()} 프로파일로 변환하세요.`);
  }
  if (input.sliceHeightsPx && preset.requiresSlicing) {
    const idx = input.sliceHeightsPx.findIndex((h) => h > preset.maxSliceHeightPx);
    if (idx >= 0) {
      add("slice-height-exceeded", "error", `${idx + 1}번 슬라이스 높이가 플랫폼 상한을 넘었습니다.`,
        `${input.sliceHeightsPx[idx] ?? 0}px`, `<= ${preset.maxSliceHeightPx}px`,
        `안전 슬라이스 플래너로 단일 높이를 ${preset.recommendedSliceHeightPx}px 이하로 재분할하세요.`);
    }
  }
  if (input.sliceByteSizes) {
    const idx = input.sliceByteSizes.findIndex((b) => b > preset.maxSingleFileBytes);
    if (idx >= 0) {
      add("single-file-size-exceeded", "error", `${idx + 1}번 슬라이스 파일 용량이 단일 상한을 넘었습니다.`,
        formatMb(input.sliceByteSizes[idx] ?? 0), `<= ${formatMb(preset.maxSingleFileBytes)}`,
        "JPEG 품질을 88~92 범위로 조정하거나 슬라이스를 한 번 더 나누세요.");
    }
  }
  const totalBytes = input.estimatedTotalBytes ??
    input.sliceByteSizes?.reduce((acc, value) => acc + value, 0);
  if (totalBytes !== undefined && totalBytes > preset.maxTotalEpisodeBytes) {
    add("total-episode-size-exceeded", "error", "회차 총 출고 용량이 플랫폼 허용치를 넘었습니다.",
      formatMb(totalBytes), `<= ${formatMb(preset.maxTotalEpisodeBytes)}`,
      "배경 단색 구간 최적화 또는 JPEG 점진적 압축을 적용하세요.");
  }
  if (
    preset.englishBubblePaddingPx > 0 &&
    input.englishBubblePaddingPx !== undefined &&
    input.englishBubblePaddingPx < preset.englishBubblePaddingPx
  ) {
    add("english-bubble-margin-tight", "warning", "글로벌 영문 식자 대비 말풍선 내부 여백이 좁습니다.",
      `${input.englishBubblePaddingPx}px`, `>= ${preset.englishBubblePaddingPx}px`,
      `영문 줄바꿈 확장 여유를 위해 말풍선 여백을 ${preset.englishBubblePaddingPx}px 이상 확보하세요.`);
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  return {
    preset, passed: errorCount === 0, errorCount,
    warningCount: issues.length - errorCount, requiredBleedPx, issues,
  };
}

interface ExpandedZone {
  readonly id: string;
  readonly topY: number;
  readonly bottomY: number;
  readonly weight: number;
}

function expandZones(zones: readonly ProtectedCutZone[]): readonly ExpandedZone[] {
  return zones.map((zone) => {
    const pad = Math.max(0, zone.paddingPx ?? DEFAULT_ZONE_PADDING_PX[zone.kind]);
    return {
      id: zone.id,
      topY: Math.min(zone.topY, zone.bottomY) - pad,
      bottomY: Math.max(zone.topY, zone.bottomY) + pad,
      weight: ZONE_PRIORITY_WEIGHT[zone.kind],
    };
  });
}

function gutterCentralityBonus(y: number, gutters: readonly VerticalGutterBand[]): number {
  let bestBonus = 0;
  for (const band of gutters) {
    const top = Math.min(band.topY, band.bottomY);
    const bottom = Math.max(band.topY, band.bottomY);
    if (y < top || y > bottom) continue;
    const halfSpan = Math.max(1, (bottom - top) * 0.5);
    const mid = (top + bottom) * 0.5;
    const centrality = Math.max(0, 1 - Math.abs(y - mid) / halfSpan);
    // 여백 테두리(-40)보다 여백 중앙(-100)에 강한 가점을 주어 컷 경계선 밀착 절단을 방지한다.
    const bonus = -(40 + 60 * centrality);
    if (bonus < bestBonus) bestBonus = bonus;
  }
  return bestBonus;
}

function collectHits(y: number, zones: readonly ExpandedZone[]): readonly ExpandedZone[] {
  return zones.filter((z) => y > z.topY && y < z.bottomY);
}

/**
 * 대사·얼굴·효과음 보호 영역을 절단하지 않도록 안전한 세로 슬라이스 절단선을 산출한다.
 * 플랫폼 단일 슬라이스 높이 상한을 엄수하면서 컷 사이 여백(Gutter) 중앙을 최우선으로 고른다.
 */
export function planSafeSliceSeams(input: SafeSlicePlanInput): SafeSlicePlanResult {
  const preset = PLATFORM_DELIVERY_PRESETS[input.presetId];
  const totalHeight = Math.max(1, Math.round(input.canvasHeightPx));
  const maxSlice = Math.max(64, Math.round(input.maxSliceHeightPx ?? preset.maxSliceHeightPx));
  const preferredSlice = Math.min(
    maxSlice, Math.max(64, Math.round(input.preferredSliceHeightPx ?? preset.recommendedSliceHeightPx)),
  );
  const minSlice = Math.min(
    preferredSlice, Math.max(64, Math.round(input.minSliceHeightPx ?? preset.minSliceHeightPx)),
  );

  if (!preset.requiresSlicing || totalHeight <= maxSlice) {
    return {
      presetId: input.presetId, totalHeightPx: totalHeight, sliceCount: 1,
      cutYPositions: [], seams: [],
      slices: [{ index: 0, startY: 0, endY: totalHeight, heightPx: totalHeight, exceedsMaxHeight: false }],
      unavoidableConflictCount: 0, allSeamsSafe: true,
      summaryKo: preset.requiresSlicing
        ? `전체 높이(${totalHeight}px)가 단일 상한(${maxSlice}px) 이하라 분할 없이 출고합니다.`
        : `${preset.nameKo} 규격은 페이지 단위 출고이므로 세로 슬라이스를 생략합니다.`,
    };
  }

  const expanded = expandZones(input.protectedZones);
  const gutters = input.gutterBands ?? [];
  const seams: PlannedSliceSeam[] = [];
  const cutYPositions: number[] = [];
  let currentY = 0;

  while (totalHeight - currentY > maxSlice) {
    const windowMin = Math.min(totalHeight - 1, currentY + minSlice);
    const windowMax = Math.min(totalHeight - 1, currentY + maxSlice);
    const idealY = Math.min(windowMax, Math.max(windowMin, currentY + preferredSlice));
    const idealHits = collectHits(idealY, expanded);

    const candidates = new Set<number>([idealY, windowMin, windowMax]);
    for (const band of gutters) {
      const mid = Math.round((band.topY + band.bottomY) * 0.5);
      if (mid >= windowMin && mid <= windowMax) candidates.add(mid);
    }
    for (const zone of expanded) {
      const above = Math.floor(zone.topY);
      const below = Math.ceil(zone.bottomY);
      if (above >= windowMin && above <= windowMax) candidates.add(above);
      if (below >= windowMin && below <= windowMax) candidates.add(below);
    }
    for (let y = windowMin; y <= windowMax; y += 16) candidates.add(y);

    let bestY = idealY;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestHits: readonly ExpandedZone[] = idealHits;
    let bestInGutter = false;

    for (const y of candidates) {
      const hits = collectHits(y, expanded);
      const gutterBonus = hits.length === 0 ? gutterCentralityBonus(y, gutters) : 0;
      let score = hits.reduce((sum, z) => sum + z.weight * 1_000, 0) + gutterBonus;
      const remaining = totalHeight - y;
      if (remaining > 0 && remaining < minSlice * 0.5) score += 40;
      score += Math.abs(y - idealY) * 0.12;
      if (score < bestScore) {
        bestScore = score;
        bestY = y;
        bestHits = hits;
        bestInGutter = gutterBonus < 0;
      }
    }

    const bestHitIds = bestHits.map((z) => z.id);
    const avoidedZoneIds = idealHits.filter((z) => !bestHitIds.includes(z.id)).map((z) => z.id);
    const shiftedByPx = bestY - idealY;
    const reasonKo = bestHitIds.length > 0
      ? `높이 상한(${maxSlice}px) 내 완전 회피 구간이 없어 최소 피해 위치(${bestY}px)를 선택했습니다.`
      : avoidedZoneIds.length > 0 && bestInGutter
        ? `보호 영역 ${avoidedZoneIds.length}건을 피해 컷 사이 여백 중앙(${bestY}px)으로 이동했습니다.`
        : avoidedZoneIds.length > 0
          ? `대사·얼굴 보호 영역 ${avoidedZoneIds.length}건을 피해 ${bestY}px로 조정했습니다.`
          : bestInGutter && shiftedByPx !== 0
            ? `가까운 컷 사이 여백 중앙(${bestY}px)에 맞춰 분할선을 정렬했습니다.`
            : "기본 권장 높이에서 안전하게 분할했습니다.";

    seams.push({
      seamIndex: seams.length, y: bestY, idealY, shiftedByPx, insideGutter: bestInGutter,
      avoidedZoneIds, unavoidableConflictZoneIds: bestHitIds, reasonKo,
    });
    cutYPositions.push(bestY);
    currentY = bestY;
  }

  const slices: PlannedSliceSegment[] = [];
  let startY = 0;
  for (let i = 0; i <= cutYPositions.length; i += 1) {
    const endY = cutYPositions[i] ?? totalHeight;
    const heightPx = endY - startY;
    slices.push({ index: i, startY, endY, heightPx, exceedsMaxHeight: heightPx > maxSlice });
    startY = endY;
  }
  const unavoidableConflictCount = seams.reduce((s, x) => s + x.unavoidableConflictZoneIds.length, 0);
  const allSeamsSafe = unavoidableConflictCount === 0;
  return {
    presetId: input.presetId, totalHeightPx: totalHeight, sliceCount: slices.length,
    cutYPositions, seams, slices, unavoidableConflictCount, allSeamsSafe,
    summaryKo: allSeamsSafe
      ? `총 ${slices.length}장 분할 완료 — 모든 절단선이 대사·얼굴 보호 영역을 피했습니다.`
      : `총 ${slices.length}장 분할 — 불가피한 겹침 ${unavoidableConflictCount}건은 수동 확인이 필요합니다.`,
  };
}
