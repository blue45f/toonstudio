/**
 * 웹툰 플랫폼 규격 프리셋, 스마트 안전 분할선(여백 스냅) 계산기,
 * 모바일 360px/390px 가독성 및 캐릭터 얼굴 가림(Occlusion) 자동 검수 엔진.
 */

export type WebtoonPlatformId = "naver" | "kakao" | "webtoon-global" | "piccoma";

export interface WebtoonPlatformSpec {
  readonly id: WebtoonPlatformId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly widthPx: number;
  readonly maxSliceHeightPx: number;
  readonly maxFileSizeMb: number;
  readonly maxFileSizeBytes: number;
  readonly requiredColorSpace: "sRGB";
  readonly recommendedGutterPx: number;
}

const BYTES_PER_MB = 1024 * 1024;

export const WEBTOON_PLATFORM_SPECS: Readonly<Record<WebtoonPlatformId, WebtoonPlatformSpec>> = {
  naver: {
    id: "naver",
    nameKo: "네이버웹툰",
    nameEn: "Naver Webtoon",
    widthPx: 690,
    maxSliceHeightPx: 20_000,
    maxFileSizeMb: 2,
    maxFileSizeBytes: 2 * BYTES_PER_MB,
    requiredColorSpace: "sRGB",
    recommendedGutterPx: 24,
  },
  kakao: {
    id: "kakao",
    nameKo: "카카오웹툰 · 카카오페이지",
    nameEn: "Kakao Webtoon / KakaoPage",
    widthPx: 720,
    maxSliceHeightPx: 16_000,
    maxFileSizeMb: 2,
    maxFileSizeBytes: 2 * BYTES_PER_MB,
    requiredColorSpace: "sRGB",
    recommendedGutterPx: 24,
  },
  "webtoon-global": {
    id: "webtoon-global",
    nameKo: "WEBTOON 글로벌",
    nameEn: "WEBTOON Global",
    widthPx: 800,
    maxSliceHeightPx: 1_280,
    maxFileSizeMb: 2,
    maxFileSizeBytes: 2 * BYTES_PER_MB,
    requiredColorSpace: "sRGB",
    recommendedGutterPx: 20,
  },
  piccoma: {
    id: "piccoma",
    nameKo: "픽코마 (일본)",
    nameEn: "Piccoma (Japan)",
    widthPx: 720,
    maxSliceHeightPx: 10_000,
    maxFileSizeMb: 2,
    maxFileSizeBytes: 2 * BYTES_PER_MB,
    requiredColorSpace: "sRGB",
    recommendedGutterPx: 20,
  },
};

export const WEBTOON_PLATFORM_SPEC_LIST: readonly WebtoonPlatformSpec[] = [
  WEBTOON_PLATFORM_SPECS.naver,
  WEBTOON_PLATFORM_SPECS.kakao,
  WEBTOON_PLATFORM_SPECS["webtoon-global"],
  WEBTOON_PLATFORM_SPECS.piccoma,
];

export function getWebtoonPlatformSpec(platformId: WebtoonPlatformId): WebtoonPlatformSpec {
  return WEBTOON_PLATFORM_SPECS[platformId];
}

export type ProtectedBoxKind = "balloon" | "face" | "sfx";

export interface ProtectedBox {
  readonly id: string;
  readonly kind: ProtectedBoxKind;
  readonly labelKo?: string;
  readonly labelEn?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SliceAccident {
  readonly sliceY: number;
  readonly boxId: string;
  readonly kind: ProtectedBoxKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly overlapFromTopPx: number;
  readonly overlapToBottomPx: number;
}

export interface SliceSegment {
  readonly index: number;
  readonly startY: number;
  readonly endY: number;
  readonly heightPx: number;
  readonly withinPlatformMaxHeight: boolean;
}

export interface SmartSafeSliceOptions {
  readonly minGutterPaddingPx?: number;
}

export interface SmartSafeSliceResult {
  readonly platform: WebtoonPlatformSpec;
  readonly canvasHeight: number;
  readonly maxSliceHeightPx: number;
  readonly naiveSliceYs: readonly number[];
  readonly naiveAccidents: readonly SliceAccident[];
  readonly naiveAccidentCount: number;
  readonly safeSliceYs: readonly number[];
  readonly safeAccidents: readonly SliceAccident[];
  readonly safeAccidentCount: number;
  readonly segments: readonly SliceSegment[];
  readonly maxSegmentHeightPx: number;
  readonly preventedAccidentCount: number;
  readonly minGutterPaddingPx: number;
}

interface VerticalInterval {
  readonly start: number;
  readonly end: number;
}

interface NormalizedProtectedBox {
  readonly id: string;
  readonly kind: ProtectedBoxKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly top: number;
  readonly bottom: number;
}

const DEFAULT_KIND_LABELS: Readonly<Record<ProtectedBoxKind, { readonly ko: string; readonly en: string }>> = {
  balloon: { ko: "말풍선", en: "Speech Balloon" },
  face: { ko: "캐릭터 얼굴·눈", en: "Character Face / Eyes" },
  sfx: { ko: "효과음(SFX)", en: "SFX Lettering" },
};

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeProtectedBoxes(
  protectedBoxes: readonly ProtectedBox[],
  canvasHeight: number,
): readonly NormalizedProtectedBox[] {
  const result: NormalizedProtectedBox[] = [];
  for (const box of protectedBoxes) {
    if (!Number.isFinite(box.y) || !Number.isFinite(box.height) || box.height <= 0) continue;
    const top = clampFinite(box.y, 0, canvasHeight);
    const bottom = clampFinite(box.y + box.height, 0, canvasHeight);
    if (bottom - top <= 0) continue;
    const fallback = DEFAULT_KIND_LABELS[box.kind];
    result.push({
      id: box.id,
      kind: box.kind,
      labelKo: box.labelKo?.trim() || `${fallback.ko} (${box.id})`,
      labelEn: box.labelEn?.trim() || `${fallback.en} (${box.id})`,
      top,
      bottom,
    });
  }
  return result.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
}

function mergeIntervals(intervals: readonly VerticalInterval[]): readonly VerticalInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }
  return merged;
}

function buildSafeGutters(
  forbidden: readonly VerticalInterval[],
  canvasHeight: number,
): readonly VerticalInterval[] {
  const gutters: VerticalInterval[] = [];
  let cursor = 0;
  for (const interval of forbidden) {
    if (interval.start > cursor) {
      gutters.push({ start: cursor, end: interval.start });
    }
    if (interval.end > cursor) {
      cursor = interval.end;
    }
  }
  if (cursor < canvasHeight) {
    gutters.push({ start: cursor, end: canvasHeight });
  }
  return gutters;
}

function findSliceAccidents(
  sliceYs: readonly number[],
  boxes: readonly NormalizedProtectedBox[],
): readonly SliceAccident[] {
  const accidents: SliceAccident[] = [];
  for (const sliceY of sliceYs) {
    for (const box of boxes) {
      // 보호 영역 내부를 정확히 관통할 때 절단 사고로 판정한다.
      if (box.top < sliceY && sliceY < box.bottom) {
        accidents.push({
          sliceY,
          boxId: box.id,
          kind: box.kind,
          labelKo: box.labelKo,
          labelEn: box.labelEn,
          overlapFromTopPx: Math.round(sliceY - box.top),
          overlapToBottomPx: Math.round(box.bottom - sliceY),
        });
      }
    }
  }
  return accidents;
}

function pickSafeCutInWindow(
  gutters: readonly VerticalInterval[],
  minY: number,
  maxY: number,
  preferBoundaryIfUncollided: boolean,
): number | null {
  // 1) maxY 자체가 안전한 여백 내부에 있으면 가장 깔끔하게 maxY 또는 여백 중앙을 선택
  if (preferBoundaryIfUncollided) {
    for (let i = gutters.length - 1; i >= 0; i -= 1) {
      const gutter = gutters[i];
      if (gutter.start <= maxY && maxY <= gutter.end && maxY > minY) {
        return Math.round(maxY);
      }
    }
  }

  // 2) [minY, maxY] 범위에서 가장 뒤쪽(높이 효율 최고)의 안전 여백 중앙으로 스냅
  for (let i = gutters.length - 1; i >= 0; i -= 1) {
    const gutter = gutters[i];
    const clampedStart = Math.max(gutter.start, minY);
    const clampedEnd = Math.min(gutter.end, maxY);
    if (clampedEnd > clampedStart) {
      const candidate = Math.round((clampedStart + clampedEnd) / 2);
      if (candidate > minY && candidate <= maxY) {
        return candidate;
      }
      if (clampedEnd > minY && clampedEnd <= maxY) {
        return Math.round(clampedEnd);
      }
    }
  }
  return null;
}

/**
 * 고정 간격 분할 시 발생하는 말풍선·얼굴·SFX 절단 사고 건수를 산출하고,
 * 보호 박스를 피하는 안전 여백(gutter)으로 분할선을 자동 스냅해 절단 사고 0건을 달성한다.
 */
export function computeSmartSafeSlices(
  canvasHeight: number,
  platformId: WebtoonPlatformId,
  protectedBoxes: readonly ProtectedBox[],
  options: SmartSafeSliceOptions = {},
): SmartSafeSliceResult {
  const platform = WEBTOON_PLATFORM_SPECS[platformId];
  const safeCanvasHeight = Number.isFinite(canvasHeight) && canvasHeight > 0 ? Math.round(canvasHeight) : 0;
  const maxSliceHeightPx = platform.maxSliceHeightPx;
  const minGutterPaddingPx = Math.max(0, Math.round(options.minGutterPaddingPx ?? Math.min(12, platform.recommendedGutterPx / 2)));

  if (safeCanvasHeight === 0) {
    return {
      platform,
      canvasHeight: 0,
      maxSliceHeightPx,
      naiveSliceYs: [],
      naiveAccidents: [],
      naiveAccidentCount: 0,
      safeSliceYs: [],
      safeAccidents: [],
      safeAccidentCount: 0,
      segments: [],
      maxSegmentHeightPx: 0,
      preventedAccidentCount: 0,
      minGutterPaddingPx,
    };
  }

  const normalizedBoxes = normalizeProtectedBoxes(protectedBoxes, safeCanvasHeight);

  // 1) 고정 간격 분할선(Naive)
  const naiveSliceYs: number[] = [];
  for (let y = maxSliceHeightPx; y < safeCanvasHeight; y += maxSliceHeightPx) {
    naiveSliceYs.push(y);
  }
  const naiveAccidents = findSliceAccidents(naiveSliceYs, normalizedBoxes);

  // 2) 스마트 안전 분할선(Gutter Snap)
  const rawForbidden = mergeIntervals(normalizedBoxes.map((b) => ({ start: b.top, end: b.bottom })));
  const paddedForbidden = mergeIntervals(
    normalizedBoxes.map((b) => ({
      start: Math.max(0, b.top - minGutterPaddingPx),
      end: Math.min(safeCanvasHeight, b.bottom + minGutterPaddingPx),
    })),
  );
  const paddedGutters = buildSafeGutters(paddedForbidden, safeCanvasHeight);
  const rawGutters = buildSafeGutters(rawForbidden, safeCanvasHeight);

  const safeSliceYs: number[] = [];
  let currentY = 0;
  let guardCounter = 0;
  const maxIterations = Math.ceil(safeCanvasHeight / Math.max(1, maxSliceHeightPx)) * 4 + 16;

  while (currentY + maxSliceHeightPx < safeCanvasHeight && guardCounter < maxIterations) {
    guardCounter += 1;
    const targetY = currentY + maxSliceHeightPx;
    const minNextY = currentY + 1;

    // 1순위: 패딩 여유까지 확보한 여백으로 스냅
    let nextCutY = pickSafeCutInWindow(paddedGutters, minNextY, targetY, true);

    // 2순위: 패딩이 좁은 경우 실제 박스 외곽 기준 안전 여백으로 스냅
    if (nextCutY === null) {
      nextCutY = pickSafeCutInWindow(rawGutters, minNextY, targetY, false);
    }

    // 3순위: 단일 보호 박스가 maxSliceHeightPx 자체보다 큰 특수 상황은 박스 종료 직후 여백으로 우회
    if (nextCutY === null) {
      const spanningInterval = rawForbidden.find((iv) => iv.start <= currentY && iv.end >= targetY);
      if (spanningInterval && spanningInterval.end < safeCanvasHeight) {
        nextCutY = Math.round(spanningInterval.end);
      } else {
        break;
      }
    }

    if (nextCutY <= currentY || nextCutY >= safeCanvasHeight) {
      break;
    }
    safeSliceYs.push(nextCutY);
    currentY = nextCutY;
  }

  const safeAccidents = findSliceAccidents(safeSliceYs, normalizedBoxes);
  const boundaries = [0, ...safeSliceYs, safeCanvasHeight];
  const segments: SliceSegment[] = [];
  let maxSegmentHeightPx = 0;

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const startY = boundaries[i];
    const endY = boundaries[i + 1];
    const heightPx = endY - startY;
    if (heightPx > maxSegmentHeightPx) maxSegmentHeightPx = heightPx;
    segments.push({
      index: i + 1,
      startY,
      endY,
      heightPx,
      withinPlatformMaxHeight: heightPx <= maxSliceHeightPx,
    });
  }

  return {
    platform,
    canvasHeight: safeCanvasHeight,
    maxSliceHeightPx,
    naiveSliceYs,
    naiveAccidents,
    naiveAccidentCount: naiveAccidents.length,
    safeSliceYs,
    safeAccidents,
    safeAccidentCount: safeAccidents.length,
    segments,
    maxSegmentHeightPx,
    preventedAccidentCount: Math.max(0, naiveAccidents.length - safeAccidents.length),
    minGutterPaddingPx,
  };
}

// ============================================================================
// 모바일 360px/390px 가독성 · 글벽 · 캐릭터 얼굴 가림(Occlusion) 감사
// ============================================================================

export type MobileQaIssueCode = "micro-font" | "text-wall" | "face-occlusion";
export type MobileQaSeverity = "critical" | "warning";

export const MOBILE_VIEWPORT_HEIGHT_PX = 640;
export const MOBILE_MIN_EFFECTIVE_FONT_PX = 11;
export const MOBILE_TEXT_WALL_THRESHOLD = 3;
export const MOBILE_FACE_OCCLUSION_THRESHOLD = 0.12;

export interface MobileQaBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly labelKo?: string;
  readonly labelEn?: string;
}

export interface MobileQaBalloon extends MobileQaBox {
  readonly text?: string;
  readonly fontSizePx: number;
  readonly kind?: "balloon" | "sfx";
}

export interface MobileQaCut {
  readonly id: string;
  readonly cutNumber: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly startY?: number;
  readonly balloons: readonly MobileQaBalloon[];
  readonly sfxBoxes?: readonly MobileQaBox[];
  readonly faceBoxes: readonly MobileQaBox[];
}

export interface MobileQaIssue {
  readonly id: string;
  readonly code: MobileQaIssueCode;
  readonly severity: MobileQaSeverity;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly targetIds: readonly string[];
  readonly metricValue: number;
  readonly thresholdValue: number;
  readonly messageKo: string;
  readonly messageEn: string;
  readonly suggestionKo: string;
  readonly suggestionEn: string;
}

export interface MobileReadabilityAuditResult {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly minEffectiveFontPx: number;
  readonly textWallThreshold: number;
  readonly maxFaceOcclusionRatio: number;
  readonly auditedCutCount: number;
  readonly auditedBalloonCount: number;
  readonly auditedFaceCount: number;
  readonly issues: readonly MobileQaIssue[];
  readonly countsByCode: Readonly<Record<MobileQaIssueCode, number>>;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly passed: boolean;
}

function computeIntersectionArea(a: MobileQaBox, b: MobileQaBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + Math.max(0, a.width), b.x + Math.max(0, b.width));
  const y2 = Math.min(a.y + Math.max(0, a.height), b.y + Math.max(0, b.height));
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

interface PositionedMobileBalloon {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly balloonId: string;
  readonly mobileTop: number;
  readonly mobileCenterY: number;
}

/**
 * 360px/390px 모바일 축소 뷰포트에서 실효 폰트 크기(<11px),
 * 단일 모바일 화면(640px 높이) 내 말풍선 3개 이상 밀집(글벽),
 * 말풍선/SFX의 캐릭터 얼굴 교차면적 비율(>12%)을 자동 검수한다.
 */
export function auditMobileReadabilityAndOcclusion(
  cuts: readonly MobileQaCut[],
  viewportWidthPx = 360,
): MobileReadabilityAuditResult {
  const safeViewportWidth = Number.isFinite(viewportWidthPx) && viewportWidthPx > 0 ? Math.round(viewportWidthPx) : 360;
  const issues: MobileQaIssue[] = [];
  const countsByCode: Record<MobileQaIssueCode, number> = {
    "micro-font": 0,
    "text-wall": 0,
    "face-occlusion": 0,
  };

  let auditedBalloonCount = 0;
  let auditedFaceCount = 0;
  let runningMobileY = 0;
  const mobileSpeechBalloons: PositionedMobileBalloon[] = [];

  for (const cut of cuts) {
    const safeCanvasWidth = Number.isFinite(cut.canvasWidthPx) && cut.canvasWidthPx > 0 ? cut.canvasWidthPx : 720;
    const safeCanvasHeight = Number.isFinite(cut.canvasHeightPx) && cut.canvasHeightPx > 0 ? cut.canvasHeightPx : 1200;
    const scale = safeViewportWidth / safeCanvasWidth;
    const cutMobileStartY = cut.startY !== undefined && Number.isFinite(cut.startY)
      ? Math.max(0, cut.startY) * scale
      : runningMobileY;

    // 1) 실효 폰트 < 11px (micro-font) + 모바일 좌표 수집
    for (const balloon of cut.balloons) {
      auditedBalloonCount += 1;
      const safeFontPx = Number.isFinite(balloon.fontSizePx) && balloon.fontSizePx > 0 ? balloon.fontSizePx : 0;
      const effectiveFontPx = Number((safeFontPx * scale).toFixed(2));
      if (effectiveFontPx < MOBILE_MIN_EFFECTIVE_FONT_PX) {
        const recommendedSourcePx = Math.ceil(MOBILE_MIN_EFFECTIVE_FONT_PX / scale);
        const severity: MobileQaSeverity = effectiveFontPx < 9 ? "critical" : "warning";
        countsByCode["micro-font"] += 1;
        issues.push({
          id: `micro-font-${cut.id}-${balloon.id}`,
          code: "micro-font",
          severity,
          cutId: cut.id,
          cutNumber: cut.cutNumber,
          targetIds: [balloon.id],
          metricValue: effectiveFontPx,
          thresholdValue: MOBILE_MIN_EFFECTIVE_FONT_PX,
          messageKo: `컷 #${cut.cutNumber} '${balloon.labelKo ?? balloon.id}' 실효 폰트 ${effectiveFontPx}px (${safeViewportWidth}px 축소 시 최소 11px 미달)`,
          messageEn: `Cut #${cut.cutNumber} '${balloon.labelEn ?? balloon.id}' renders at ${effectiveFontPx}px on ${safeViewportWidth}px mobile (< 11px minimum)`,
          suggestionKo: `원고 폰트 크기를 최소 ${recommendedSourcePx}px 이상으로 키우세요.`,
          suggestionEn: `Increase source font size to at least ${recommendedSourcePx}px.`,
        });
      }

      if ((balloon.kind ?? "balloon") !== "sfx") {
        const mobileTop = cutMobileStartY + Math.max(0, balloon.y) * scale;
        const mobileCenterY = mobileTop + (Math.max(0, balloon.height) * scale) / 2;
        mobileSpeechBalloons.push({
          cutId: cut.id,
          cutNumber: cut.cutNumber,
          balloonId: balloon.id,
          mobileTop,
          mobileCenterY,
        });
      }
    }

    // 2) 말풍선/SFX ↔ 캐릭터 얼굴 교차면적 비율 > 12% (face-occlusion)
    const overlays: readonly { readonly box: MobileQaBox; readonly kind: "balloon" | "sfx" }[] = [
      ...cut.balloons.map((b) => ({ box: b, kind: b.kind ?? ("balloon" as const) })),
      ...(cut.sfxBoxes ?? []).map((s) => ({ box: s, kind: "sfx" as const })),
    ];

    for (const face of cut.faceBoxes) {
      auditedFaceCount += 1;
      const faceArea = Math.max(0, face.width) * Math.max(0, face.height);
      if (faceArea <= 0) continue;

      for (const overlay of overlays) {
        const intersection = computeIntersectionArea(face, overlay.box);
        const ratio = intersection / faceArea;
        if (ratio > MOBILE_FACE_OCCLUSION_THRESHOLD) {
          const pct = Number((ratio * 100).toFixed(1));
          const severity: MobileQaSeverity = ratio > 0.25 ? "critical" : "warning";
          const overlayKindKo = overlay.kind === "sfx" ? "효과음(SFX)" : "말풍선";
          const overlayKindEn = overlay.kind === "sfx" ? "SFX" : "Balloon";
          countsByCode["face-occlusion"] += 1;
          issues.push({
            id: `face-occlusion-${cut.id}-${face.id}-${overlay.box.id}`,
            code: "face-occlusion",
            severity,
            cutId: cut.id,
            cutNumber: cut.cutNumber,
            targetIds: [overlay.box.id, face.id],
            metricValue: pct,
            thresholdValue: Math.round(MOBILE_FACE_OCCLUSION_THRESHOLD * 100),
            messageKo: `컷 #${cut.cutNumber} ${overlayKindKo} '${overlay.box.labelKo ?? overlay.box.id}'이(가) '${face.labelKo ?? face.id}' 얼굴의 ${pct}%를 가림 (허용 12% 초과)`,
            messageEn: `Cut #${cut.cutNumber} ${overlayKindEn} '${overlay.box.labelEn ?? overlay.box.id}' occludes ${pct}% of '${face.labelEn ?? face.id}' (> 12% limit)`,
            suggestionKo: `말풍선·SFX 위치를 캐릭터 얼굴 외곽 여백으로 이동해 가림 비율을 12% 이하로 낮추세요.`,
            suggestionEn: `Move the balloon/SFX to open margin so face occlusion stays <= 12%.`,
          });
        }
      }
    }

    runningMobileY = cutMobileStartY + safeCanvasHeight * scale;
  }

  // 3) 모바일 1화면(640px 높이) 내 말풍선 3개 이상 밀집 (text-wall)
  const sortedBalloons = [...mobileSpeechBalloons].sort((a, b) => a.mobileTop - b.mobileTop);
  let i = 0;
  while (i < sortedBalloons.length) {
    const windowStart = sortedBalloons[i].mobileTop;
    const windowEnd = windowStart + MOBILE_VIEWPORT_HEIGHT_PX;
    let j = i;
    while (j < sortedBalloons.length && sortedBalloons[j].mobileCenterY <= windowEnd) {
      j += 1;
    }
    const cluster = sortedBalloons.slice(i, j);
    if (cluster.length >= MOBILE_TEXT_WALL_THRESHOLD) {
      const lead = cluster[0];
      const severity: MobileQaSeverity = cluster.length >= 4 ? "critical" : "warning";
      countsByCode["text-wall"] += 1;
      issues.push({
        id: `text-wall-${lead.cutId}-${Math.round(windowStart)}`,
        code: "text-wall",
        severity,
        cutId: lead.cutId,
        cutNumber: lead.cutNumber,
        targetIds: cluster.map((item) => item.balloonId),
        metricValue: cluster.length,
        thresholdValue: MOBILE_TEXT_WALL_THRESHOLD,
        messageKo: `컷 #${lead.cutNumber} 부근 모바일 1화면(640px) 내 말풍선 ${cluster.length}개 밀집 (글벽 경고)`,
        messageEn: `Cut #${lead.cutNumber} packs ${cluster.length} speech balloons within a single 640px mobile screen (text wall)`,
        suggestionKo: `세로 스크롤 호흡 여백을 늘리거나 대사를 다음 컷으로 분산해 1화면당 2개 이하로 유지하세요.`,
        suggestionEn: `Increase vertical gutter pacing or split dialogue across cuts to keep <= 2 balloons per screen.`,
      });
      i = j;
    } else {
      i += 1;
    }
  }

  const criticalCount = issues.filter((item) => item.severity === "critical").length;
  const warningCount = issues.length - criticalCount;

  return {
    viewportWidthPx: safeViewportWidth,
    viewportHeightPx: MOBILE_VIEWPORT_HEIGHT_PX,
    minEffectiveFontPx: MOBILE_MIN_EFFECTIVE_FONT_PX,
    textWallThreshold: MOBILE_TEXT_WALL_THRESHOLD,
    maxFaceOcclusionRatio: MOBILE_FACE_OCCLUSION_THRESHOLD,
    auditedCutCount: cuts.length,
    auditedBalloonCount,
    auditedFaceCount,
    issues,
    countsByCode,
    criticalCount,
    warningCount,
    passed: issues.length === 0,
  };
}

// ============================================================================
// 기본 데모 시나리오 (4개 플랫폼 모두 고정 절단 사고 발생 → 스마트 스냅 0건 시연)
// ============================================================================

export const DEFAULT_SMART_SLICE_DEMO: {
  readonly canvasHeight: number;
  readonly protectedBoxes: readonly ProtectedBox[];
} = {
  canvasHeight: 42_000,
  protectedBoxes: [
    { id: "cut-01-face", kind: "face", labelKo: "1컷 주인공 클로즈업 눈", labelEn: "Cut 1 Protagonist Eyes", x: 180, y: 1_190, width: 220, height: 180 },
    { id: "cut-03-balloon", kind: "balloon", labelKo: "3컷 핵심 독백 말풍선", labelEn: "Cut 3 Monologue Balloon", x: 90, y: 2_480, width: 310, height: 170 },
    { id: "cut-09-sfx", kind: "sfx", labelKo: "9컷 폭발 효과음(쾅!!)", labelEn: "Cut 9 Impact SFX", x: 110, y: 9_920, width: 380, height: 190 },
    { id: "cut-14-face", kind: "face", labelKo: "14컷 라이벌 표정 클로즈업", labelEn: "Cut 14 Rival Face Close-up", x: 210, y: 15_910, width: 240, height: 210 },
    { id: "cut-18-balloon", kind: "balloon", labelKo: "18컷 반전 고백 말풍선", labelEn: "Cut 18 Plot-Twist Balloon", x: 120, y: 19_910, width: 340, height: 190 },
    { id: "cut-26-sfx", kind: "sfx", labelKo: "26컷 검격 효과음(채앵!)", labelEn: "Cut 26 Blade Clash SFX", x: 140, y: 31_920, width: 360, height: 180 },
    { id: "cut-34-face", kind: "face", labelKo: "34컷 엔딩 클리프행어 얼굴", labelEn: "Cut 34 Ending Cliffhanger Face", x: 190, y: 39_910, width: 240, height: 200 },
  ],
};

export const DEFAULT_MOBILE_QA_CUTS: readonly MobileQaCut[] = [
  {
    id: "cut-01",
    cutNumber: 1,
    canvasWidthPx: 720,
    canvasHeightPx: 1_150,
    balloons: [
      { id: "b-01", x: 60, y: 80, width: 260, height: 110, fontSizePx: 19, labelKo: "오프닝 속삭임 대사", labelEn: "Opening Whisper" },
      { id: "b-02", x: 340, y: 260, width: 280, height: 120, fontSizePx: 26, labelKo: "주인공 응답 대사", labelEn: "Protagonist Reply" },
      { id: "b-03", x: 100, y: 440, width: 300, height: 120, fontSizePx: 25, labelKo: "긴급 경고 대사", labelEn: "Urgent Warning" },
    ],
    faceBoxes: [
      { id: "f-01", x: 380, y: 270, width: 160, height: 160, labelKo: "주인공 얼굴", labelEn: "Protagonist Face" },
    ],
  },
  {
    id: "cut-02",
    cutNumber: 2,
    canvasWidthPx: 720,
    canvasHeightPx: 1_300,
    balloons: [
      { id: "b-04", x: 70, y: 120, width: 260, height: 110, fontSizePx: 26, labelKo: "안정적 크기의 대사", labelEn: "Readable Dialogue" },
    ],
    sfxBoxes: [
      { id: "sfx-02", x: 250, y: 520, width: 220, height: 140, labelKo: "타격 효과음(퍽!)", labelEn: "Impact SFX" },
    ],
    faceBoxes: [
      { id: "f-02", x: 290, y: 540, width: 150, height: 150, labelKo: "상대역 얼굴", labelEn: "Opponent Face" },
    ],
  },
];

/**
 * 데모 컷의 모바일 가독성·글벽·얼굴 가림 결함을 해소한 보정 컷 프리셋을 반환한다.
 */
export function buildRemediatedMobileQaCuts(cuts: readonly MobileQaCut[], viewportWidthPx = 360): readonly MobileQaCut[] {
  const safeViewport = Number.isFinite(viewportWidthPx) && viewportWidthPx > 0 ? viewportWidthPx : 360;
  return cuts.map((cut) => {
    const scale = safeViewport / Math.max(1, cut.canvasWidthPx);
    const minSourceFontPx = Math.ceil(MOBILE_MIN_EFFECTIVE_FONT_PX / scale);
    const screenStepCanvasPx = Math.ceil((MOBILE_VIEWPORT_HEIGHT_PX * 0.62) / scale);

    const fixedBalloons: MobileQaBalloon[] = cut.balloons.map((balloon, idx) => ({
      ...balloon,
      fontSizePx: Math.max(balloon.fontSizePx, minSourceFontPx),
      x: 24,
      y: 40 + idx * screenStepCanvasPx,
    }));

    const maxBottomY = fixedBalloons.reduce(
      (acc, b) => Math.max(acc, b.y + screenStepCanvasPx),
      cut.canvasHeightPx,
    );
    const fixedSfx = (cut.sfxBoxes ?? []).map((sfx) => ({
      ...sfx,
      x: 24,
      y: Math.max(40, sfx.y - 260),
    }));
    const fixedFaces = cut.faceBoxes.map((face) => ({
      ...face,
      x: Math.max(face.x, Math.round(cut.canvasWidthPx * 0.62)),
    }));

    return {
      ...cut,
      canvasHeightPx: maxBottomY,
      balloons: fixedBalloons,
      sfxBoxes: fixedSfx,
      faceBoxes: fixedFaces,
    };
  });
}
