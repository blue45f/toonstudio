/**
 * Wave 109 — 플랫폼별 썸네일 프리셋 규격 정의, 타입 계약, 입력 검증 및 2D 사각형 기하 유틸리티.
 */

export type PlatformThumbnailPresetId =
  | "naver-episode-thumb"
  | "naver-series-square"
  | "kakao-vertical-poster"
  | "global-webtoon-banner"
  | "og-social-card"
  | "hero-widescreen";

export type UiBadgeAnchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-bar"
  | "bottom-bar";

export type SmartThumbnailErrorCode =
  | "INVALID_SOURCE_DIMENSIONS"
  | "UNKNOWN_PRESET_ID"
  | "INVALID_SUBJECT_SPEC"
  | "INVALID_BOX_SPEC"
  | "EMPTY_PRESET_LIST";

export class SmartThumbnailError extends Error {
  readonly code: SmartThumbnailErrorCode;

  constructor(code: SmartThumbnailErrorCode, message: string) {
    super(message);
    this.name = "SmartThumbnailError";
    this.code = code;
  }
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface PlatformUiBadgeZone {
  readonly zoneId: string;
  readonly labelKo: string;
  readonly badgeText: string;
  readonly anchor: UiBadgeAnchor;
  /** 크롭 프레임 기준 정규화 좌표([0, 1]) */
  readonly normRect: Rect2D;
}

export interface PlatformThumbnailPresetSpec {
  readonly presetId: PlatformThumbnailPresetId;
  readonly platformNameKo: string;
  readonly deliveryNameKo: string;
  readonly targetWidthPx: number;
  readonly targetHeightPx: number;
  readonly targetAspectRatio: number;
  readonly idealEyeNormYMin: number;
  readonly idealEyeNormYMax: number;
  readonly uiBadgeZones: readonly PlatformUiBadgeZone[];
  readonly maxRecommendedUpscaleRatio: number;
}

export interface CropSubjectSpec {
  readonly subjectId: string;
  readonly labelKo: string;
  /** 1..10 범위. 값이 클수록 핵심 주연으로 우선 보호한다. */
  readonly priority: number;
  readonly faceBox: Rect2D;
  readonly eyeLinePoint: Point2D;
  readonly fullBodyBox?: Rect2D;
}

export interface SmartThumbnailSourceSpec {
  readonly artworkId: string;
  readonly titleKo: string;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly subjects: readonly CropSubjectSpec[];
  readonly logoBox?: Rect2D;
}

export interface SmartThumbnailSolverOptions {
  readonly upscaleWarningThreshold?: number;
  readonly faceComfortMarginRatio?: number;
  readonly minScaleFraction?: number;
  readonly scaleSampleCount?: number;
  readonly gridStepsPerAxis?: number;
}

export interface ProjectedUiBadgeRect {
  readonly zoneId: string;
  readonly labelKo: string;
  readonly badgeText: string;
  readonly anchor: UiBadgeAnchor;
  readonly sourceRect: Rect2D;
  readonly occludesPrimaryEye: boolean;
  readonly primaryFaceOverlapRatio: number;
}

export interface SubjectCropCoverage {
  readonly subjectId: string;
  readonly labelKo: string;
  readonly priority: number;
  readonly isPrimary: boolean;
  readonly faceContainedRatio: number;
  readonly faceFullyContained: boolean;
  readonly eyeNormX: number;
  readonly eyeNormY: number;
  readonly eyeInsideCrop: boolean;
  readonly eyeOccludedByUiBadge: boolean;
}

export interface SolvedPresetCrop {
  readonly presetId: PlatformThumbnailPresetId;
  readonly preset: PlatformThumbnailPresetSpec;
  readonly cropWindow: Rect2D;
  readonly cropAspectRatio: number;
  readonly aspectRatioRelativeError: number;
  readonly withinSourceBounds: boolean;
  readonly primarySubjectId: string | null;
  readonly primaryFaceContainedRatio: number;
  readonly primaryFaceFullyContained: boolean;
  readonly primaryEyeNorm: Point2D | null;
  readonly ruleOfThirdsAlignmentScore: number;
  readonly primaryEyeOccludedByUiBadge: boolean;
  readonly primaryFaceBadgeOverlapRatio: number;
  readonly projectedUiBadges: readonly ProjectedUiBadgeRect[];
  readonly subjectCoverages: readonly SubjectCropCoverage[];
  readonly upscaleRatio: number;
  readonly lowResolutionWarning: boolean;
  readonly compositeScore: number;
  readonly warningsKo: readonly string[];
}

export interface SmartThumbnailCropSolution {
  readonly artworkId: string;
  readonly titleKo: string;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly primarySubjectId: string | null;
  readonly upscaleWarningThreshold: number;
  readonly crops: readonly SolvedPresetCrop[];
  readonly allPrimaryFacesContained: boolean;
  readonly anyPrimaryEyeOccludedByUiBadge: boolean;
  readonly lowResolutionPresetIds: readonly PlatformThumbnailPresetId[];
  readonly maxAspectRatioRelativeError: number;
}

export const ALL_PLATFORM_THUMBNAIL_PRESET_IDS: readonly PlatformThumbnailPresetId[] = [
  "naver-episode-thumb",
  "naver-series-square",
  "kakao-vertical-poster",
  "global-webtoon-banner",
  "og-social-card",
  "hero-widescreen",
];

export const PLATFORM_THUMBNAIL_PRESETS: Readonly<
  Record<PlatformThumbnailPresetId, PlatformThumbnailPresetSpec>
> = {
  "naver-episode-thumb": {
    presetId: "naver-episode-thumb",
    platformNameKo: "네이버 웹툰",
    deliveryNameKo: "회차 썸네일",
    targetWidthPx: 202,
    targetHeightPx: 120,
    targetAspectRatio: 202 / 120,
    idealEyeNormYMin: 0.33,
    idealEyeNormYMax: 0.42,
    uiBadgeZones: [
      { zoneId: "naver-up-badge", labelKo: "좌상단 UP 배지", badgeText: "UP", anchor: "top-left", normRect: { x: 0, y: 0, width: 0.24, height: 0.28 } },
    ],
    maxRecommendedUpscaleRatio: 2.0,
  },
  "naver-series-square": {
    presetId: "naver-series-square",
    platformNameKo: "네이버 시리즈",
    deliveryNameKo: "정방형 대표 썸네일",
    targetWidthPx: 434,
    targetHeightPx: 408,
    targetAspectRatio: 434 / 408,
    idealEyeNormYMin: 0.33,
    idealEyeNormYMax: 0.42,
    uiBadgeZones: [
      { zoneId: "series-new-badge", labelKo: "좌상단 NEW 배지", badgeText: "NEW", anchor: "top-left", normRect: { x: 0, y: 0, width: 0.22, height: 0.18 } },
      { zoneId: "series-rating-badge", labelKo: "우하단 연령 등급 배지", badgeText: "15+", anchor: "bottom-right", normRect: { x: 0.78, y: 0.80, width: 0.22, height: 0.20 } },
    ],
    maxRecommendedUpscaleRatio: 2.0,
  },
  "kakao-vertical-poster": {
    presetId: "kakao-vertical-poster",
    platformNameKo: "카카오페이지·웹툰",
    deliveryNameKo: "세로형 포스터",
    targetWidthPx: 600,
    targetHeightPx: 900,
    targetAspectRatio: 600 / 900,
    idealEyeNormYMin: 0.28,
    idealEyeNormYMax: 0.38,
    uiBadgeZones: [
      { zoneId: "kakao-top-left-badge", labelKo: "좌상단 프로모션 배지", badgeText: "기다무", anchor: "top-left", normRect: { x: 0, y: 0, width: 0.26, height: 0.10 } },
      { zoneId: "kakao-bottom-title-safe", labelKo: "하단 22% 타이틀 안전 영역", badgeText: "TITLE 22%", anchor: "bottom-bar", normRect: { x: 0, y: 0.78, width: 1.0, height: 0.22 } },
    ],
    maxRecommendedUpscaleRatio: 2.0,
  },
  "global-webtoon-banner": {
    presetId: "global-webtoon-banner",
    platformNameKo: "글로벌 웹툰",
    deliveryNameKo: "세로 풀스크린 배너",
    targetWidthPx: 1080,
    targetHeightPx: 1920,
    targetAspectRatio: 1080 / 1920,
    idealEyeNormYMin: 0.32,
    idealEyeNormYMax: 0.42,
    uiBadgeZones: [
      { zoneId: "global-top-chrome", labelKo: "상단 시스템·내비게이션 여백", badgeText: "TOP UI", anchor: "top-bar", normRect: { x: 0, y: 0, width: 1.0, height: 0.11 } },
      { zoneId: "global-bottom-chrome", labelKo: "하단 CTA·회차 안내 여백", badgeText: "BOTTOM UI", anchor: "bottom-bar", normRect: { x: 0, y: 0.82, width: 1.0, height: 0.18 } },
    ],
    maxRecommendedUpscaleRatio: 2.0,
  },
  "og-social-card": {
    presetId: "og-social-card",
    platformNameKo: "오픈그래프·SNS",
    deliveryNameKo: "소셜 공유 카드",
    targetWidthPx: 1200,
    targetHeightPx: 630,
    targetAspectRatio: 1200 / 630,
    idealEyeNormYMin: 0.33,
    idealEyeNormYMax: 0.42,
    uiBadgeZones: [],
    maxRecommendedUpscaleRatio: 2.0,
  },
  "hero-widescreen": {
    presetId: "hero-widescreen",
    platformNameKo: "스토어·트레일러",
    deliveryNameKo: "16:9 와이드 히어로",
    targetWidthPx: 1920,
    targetHeightPx: 1080,
    targetAspectRatio: 1920 / 1080,
    idealEyeNormYMin: 0.33,
    idealEyeNormYMax: 0.42,
    uiBadgeZones: [],
    maxRecommendedUpscaleRatio: 2.0,
  },
};

export const CONTAINMENT_EPSILON = 1e-6;
export const BOUNDS_EPSILON = 1e-6;

export function clampNumber(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function rectArea(r: Rect2D): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

export function rectIntersectionArea(a: Rect2D, b: Rect2D): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
}

export function pointInsideRect(pt: Point2D, rect: Rect2D, margin = 0): boolean {
  return (
    pt.x >= rect.x - margin &&
    pt.x <= rect.x + rect.width + margin &&
    pt.y >= rect.y - margin &&
    pt.y <= rect.y + rect.height + margin
  );
}

export function isRectContainedIn(inner: Rect2D, outer: Rect2D): boolean {
  return (
    inner.x >= outer.x - CONTAINMENT_EPSILON &&
    inner.y >= outer.y - CONTAINMENT_EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + CONTAINMENT_EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + CONTAINMENT_EPSILON
  );
}

export function computeRectUnionOverlapRatio(target: Rect2D, blockers: readonly Rect2D[]): number {
  const area = rectArea(target);
  if (area <= 0 || blockers.length === 0) return 0;
  if (blockers.length === 1) return clampNumber(rectIntersectionArea(target, blockers[0]) / area, 0, 1);

  const xs: number[] = [];
  for (let i = 0; i < blockers.length; i += 1) {
    const b = blockers[i];
    const x0 = Math.max(target.x, b.x);
    const x1 = Math.min(target.x + target.width, b.x + b.width);
    if (x1 > x0) xs.push(x0, x1);
  }
  if (xs.length < 2) return 0;
  xs.sort((a, b) => a - b);

  let coveredArea = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const segX0 = xs[i];
    const segX1 = xs[i + 1];
    if (segX1 - segX0 <= 1e-9) continue;
    const midX = (segX0 + segX1) * 0.5;
    const intervals: { readonly y0: number; readonly y1: number }[] = [];
    for (let j = 0; j < blockers.length; j += 1) {
      const b = blockers[j];
      if (midX >= b.x && midX <= b.x + b.width) {
        const y0 = Math.max(target.y, b.y);
        const y1 = Math.min(target.y + target.height, b.y + b.height);
        if (y1 > y0) intervals.push({ y0, y1 });
      }
    }
    if (intervals.length === 0) continue;
    intervals.sort((a, b) => a.y0 - b.y0);
    let curY0 = intervals[0].y0;
    let curY1 = intervals[0].y1;
    let segHeight = 0;
    for (let k = 1; k < intervals.length; k += 1) {
      if (intervals[k].y0 <= curY1) {
        curY1 = Math.max(curY1, intervals[k].y1);
      } else {
        segHeight += curY1 - curY0;
        curY0 = intervals[k].y0;
        curY1 = intervals[k].y1;
      }
    }
    segHeight += curY1 - curY0;
    coveredArea += (segX1 - segX0) * segHeight;
  }
  return clampNumber(coveredArea / area, 0, 1);
}

function validateFiniteRect(rect: Rect2D, label: string): void {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new SmartThumbnailError("INVALID_BOX_SPEC", `${label}의 사각형 좌표·크기가 유효하지 않습니다.`);
  }
}

export function validateSourceSpec(source: SmartThumbnailSourceSpec): void {
  if (
    !Number.isFinite(source.sourceWidthPx) ||
    !Number.isFinite(source.sourceHeightPx) ||
    source.sourceWidthPx <= 0 ||
    source.sourceHeightPx <= 0
  ) {
    throw new SmartThumbnailError("INVALID_SOURCE_DIMENSIONS", "원본 캔버스 가로·세로 크기는 양의 유한수여야 합니다.");
  }
  const canvasRect: Rect2D = { x: 0, y: 0, width: source.sourceWidthPx, height: source.sourceHeightPx };
  for (let i = 0; i < source.subjects.length; i += 1) {
    const s = source.subjects[i];
    if (!Number.isFinite(s.priority) || s.priority < 1 || s.priority > 10) {
      throw new SmartThumbnailError("INVALID_SUBJECT_SPEC", `피사체(${s.subjectId})의 priority는 1~10 범위여야 합니다.`);
    }
    validateFiniteRect(s.faceBox, `피사체(${s.subjectId}) faceBox`);
    if (!Number.isFinite(s.eyeLinePoint.x) || !Number.isFinite(s.eyeLinePoint.y)) {
      throw new SmartThumbnailError("INVALID_SUBJECT_SPEC", `피사체(${s.subjectId}) eyeLinePoint가 유한수가 아닙니다.`);
    }
    if (!isRectContainedIn(s.faceBox, canvasRect)) {
      throw new SmartThumbnailError("INVALID_SUBJECT_SPEC", `피사체(${s.subjectId}) faceBox가 원본 캔버스 영역을 벗어났습니다.`);
    }
    if (s.fullBodyBox) validateFiniteRect(s.fullBodyBox, `피사체(${s.subjectId}) fullBodyBox`);
  }
  if (source.logoBox) validateFiniteRect(source.logoBox, "logoBox");
}

export function sortSubjectsByPriority(subjects: readonly CropSubjectSpec[]): CropSubjectSpec[] {
  return subjects.slice().sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const areaDiff = rectArea(b.faceBox) - rectArea(a.faceBox);
    if (Math.abs(areaDiff) > 1e-6) return areaDiff;
    return a.subjectId < b.subjectId ? -1 : a.subjectId > b.subjectId ? 1 : 0;
  });
}

export function computeMaxInscribedSize(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
): { readonly maxWidth: number; readonly maxHeight: number } {
  return sourceWidth / sourceHeight >= targetAspect
    ? { maxWidth: sourceHeight * targetAspect, maxHeight: sourceHeight }
    : { maxWidth: sourceWidth, maxHeight: sourceWidth / targetAspect };
}
