/**
 * ToonStudio 페이지/요소(`ThumbPageLike` / `ReaderPreviewPage` / `BubbleEl`)를
 * 시선 동선(Eye-Flow) 및 말풍선 꼬리 얼굴 가림 엔진 입력으로 변환하는 순수 어댑터.
 *
 * DOM·React·Konva에 의존하지 않으며, 실제 말풍선의 `tailDirection`·`tailXRatio`·`tailHeight`·
 * `tailAnchorPoint`·`extraTails` 규약을 `studio-bubble-path.ts`와 일치하게 해석한다.
 */

import {
  analyzeEyeFlowAndTailGuard,
  computeBalloonTailBase,
} from "./studio-eyeflow-geometry";
import {
  applyRhythmPresetToEyeFlowPage,
  buildMultiPageRhythmPreviews,
  computeStudioPageRhythmPlan,
  type MultiPageRhythmPresetPreview,
} from "./studio-eyeflow-page-rhythm";
import type {
  EyeFlowAnalysisConfig,
  EyeFlowAnalysisResult,
  EyeFlowBalloonInput,
  EyeFlowCutBounds,
  EyeFlowFaceRegion,
  EyeFlowPatternMode,
  EyeFlowPoint,
  EyeFlowReadingDirection,
  EyeFlowRect,
  EyeFlowSegment,
  MobileSpoilerGuardConfig,
  MobileViewportSpoilerRisk,
  TailCrossingWarning,
  TailOcclusionWarning,
} from "./studio-eyeflow-types";

export {
  CUT_RHYTHM_PRESET_LIST,
  CUT_RHYTHM_PRESETS,
  DEFAULT_MOBILE_SPOILER_VIEWPORT,
  computeAutoCutRhythmPlan,
  computeMobileViewportCanvasSpanPx,
  detectMobileViewportSpoilerRisks,
} from "./studio-eyeflow-rhythm-solver";
export {
  applyRhythmPresetToEyeFlowPage,
  computeStudioPageRhythmPlan,
  type MultiPageRhythmPresetPreview,
};
export type {
  AutoCutRhythmInput,
  AutoCutRhythmPlanOptions,
  AutoCutRhythmPlanResult,
  CutGutterDecision,
  CutRhythmPresetDescriptor,
  RepositionedCutLayout,
} from "./studio-eyeflow-rhythm-solver";

export interface EyeFlowElementLike {
  readonly id?: string;
  readonly type: string;
  readonly name?: string;
  readonly label?: string;
  readonly hidden?: boolean;
  readonly opacity?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly text?: string;
  readonly readingOrder?: number;
  readonly tail?: string;
  readonly tailDirection?: string;
  readonly tailXRatio?: number;
  readonly tailHeight?: number;
  readonly tailBase?: number;
  readonly tailAnchorPoint?: { readonly x: number; readonly y: number };
  readonly extraTails?: ReadonlyArray<{
    readonly direction: string;
    readonly ratio: number;
    readonly length: number;
    readonly base: number;
    readonly side: string;
  }>;
  readonly faceBounds?: EyeFlowRect;
  readonly eyeBounds?: EyeFlowRect;
  readonly kind?: string;
  readonly layerRole?: string;
  readonly characterId?: string;
  readonly vrmScene?: unknown;
  /** 컷 시각 밀도(0..1, 프레임/패널 요소용 선택 메타데이터). */
  readonly visualDensity01?: number;
  /** 클라이맥스/반전 컷 여부(프레임/패널 요소용 선택 메타데이터). */
  readonly isClimaxBeat?: boolean;
  /** 클라이맥스 강도(0..1). */
  readonly climaxIntensity01?: number;
}

export interface EyeFlowPageLike {
  readonly id: string;
  readonly name?: string;
  readonly canvasH: number;
  readonly canvasW?: number;
  readonly elements: readonly EyeFlowElementLike[];
}

export interface MultiPageEyeFlowPageSummary {
  readonly pageId: string;
  readonly analysis: EyeFlowAnalysisResult;
}

export interface MultiPageEyeFlowIssue {
  readonly id: string;
  readonly pageId: string;
  readonly category: "reversal" | "occlusion" | "tail-crossing";
  readonly severity: "warning" | "critical";
  readonly sequenceNumber: number;
  readonly messageKo: string;
  readonly detailKo: string;
  readonly recommendedTailTip: EyeFlowPoint | null;
}

export interface MultiPageEyeFlowSummary {
  readonly direction: EyeFlowReadingDirection;
  readonly pages: readonly MultiPageEyeFlowPageSummary[];
  readonly byPageId: ReadonlyMap<string, EyeFlowAnalysisResult>;
  readonly issues: readonly MultiPageEyeFlowIssue[];
  readonly spoilerRisks: readonly (MobileViewportSpoilerRisk & { readonly pageId: string })[];
  readonly rhythmPreviews: readonly MultiPageRhythmPresetPreview[];
  readonly totalBalloons: number;
  readonly totalFaces: number;
  readonly reversalCount: number;
  readonly occlusionCount: number;
  readonly tailCrossingCount: number;
  readonly spoilerRiskCount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly overallScore: number;
}

const DEFAULT_CANVAS_W = 720;
const DEFAULT_CANVAS_H = 1_280;
const DEFAULT_BALLOON_W = 160;
const DEFAULT_BALLOON_H = 72;
const CUT_TYPES = new Set(["frame", "panel"]);
const BALLOON_TYPES = new Set(["bubble", "dialogue", "caption"]);
const CHARACTER_TYPES = new Set(["character", "vrm"]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isVisible(element: EyeFlowElementLike): boolean {
  if (element.hidden === true) return false;
  if (typeof element.opacity === "number" && element.opacity <= 0) return false;
  return true;
}

function isValidRect(rect: EyeFlowRect | undefined): rect is EyeFlowRect {
  return (
    Boolean(rect) &&
    Number.isFinite(rect!.x) &&
    Number.isFinite(rect!.y) &&
    Number.isFinite(rect!.width) &&
    Number.isFinite(rect!.height) &&
    rect!.width > 0 &&
    rect!.height > 0
  );
}

function rotateAroundOrigin(
  localX: number,
  localY: number,
  originX: number,
  originY: number,
  rotationDeg: number,
): EyeFlowPoint {
  if (!Number.isFinite(rotationDeg) || Math.abs(rotationDeg) < 1e-4) {
    return { x: round2(originX + localX), y: round2(originY + localY) };
  }
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: round2(originX + localX * cos - localY * sin),
    y: round2(originY + localX * sin + localY * cos),
  };
}

function resolveTailEndpointsFromSpec(params: {
  readonly bounds: EyeFlowRect;
  readonly rotationDeg: number;
  readonly direction: string;
  readonly ratio: number;
  readonly length: number;
  readonly baseWidth: number;
  readonly side: string;
}): { readonly base: EyeFlowPoint; readonly tip: EyeFlowPoint } {
  const { bounds, rotationDeg, direction, ratio, length, baseWidth, side } = params;
  const clampedRatio = clamp(ratio, 0.12, 0.88);
  const safeLength = Math.max(4, length);
  const sideShift =
    side === "left" ? -baseWidth * 0.45 : side === "right" ? baseWidth * 0.45 : 0;

  let localBaseX: number;
  let localBaseY: number;
  let localTipX: number;
  let localTipY: number;

  if (direction === "top") {
    localBaseX = bounds.width * clampedRatio;
    localBaseY = 0;
    localTipX = clamp(localBaseX + sideShift, 0, bounds.width);
    localTipY = -safeLength;
  } else if (direction === "left") {
    localBaseX = 0;
    localBaseY = bounds.height * clampedRatio;
    localTipX = -safeLength;
    localTipY = clamp(localBaseY + sideShift, 0, bounds.height);
  } else if (direction === "right") {
    localBaseX = bounds.width;
    localBaseY = bounds.height * clampedRatio;
    localTipX = bounds.width + safeLength;
    localTipY = clamp(localBaseY + sideShift, 0, bounds.height);
  } else {
    // bottom (웹툰 기본 꼬리 방향)
    localBaseX = bounds.width * clampedRatio;
    localBaseY = bounds.height;
    localTipX = clamp(localBaseX + sideShift, 0, bounds.width);
    localTipY = bounds.height + safeLength;
  }

  return {
    base: rotateAroundOrigin(localBaseX, localBaseY, bounds.x, bounds.y, rotationDeg),
    tip: rotateAroundOrigin(localTipX, localTipY, bounds.x, bounds.y, rotationDeg),
  };
}

function extractBalloonInput(
  element: EyeFlowElementLike,
  fallbackIndex: number,
): EyeFlowBalloonInput | null {
  if (!Number.isFinite(element.y)) return null;

  const x = Number.isFinite(element.x) ? (element.x as number) : 0;
  const y = element.y as number;
  const width =
    typeof element.width === "number" && Number.isFinite(element.width) && element.width > 0
      ? element.width
      : DEFAULT_BALLOON_W;
  const height =
    typeof element.height === "number" && Number.isFinite(element.height) && element.height > 0
      ? element.height
      : DEFAULT_BALLOON_H;
  const bounds: EyeFlowRect = { x, y, width, height };
  const rotationDeg = Number.isFinite(element.rotation) ? (element.rotation as number) : 0;

  let tailBase: EyeFlowPoint | undefined;
  let tailTip: EyeFlowPoint | undefined;

  if (
    element.tailAnchorPoint &&
    Number.isFinite(element.tailAnchorPoint.x) &&
    Number.isFinite(element.tailAnchorPoint.y)
  ) {
    tailTip = {
      x: round2(element.tailAnchorPoint.x),
      y: round2(element.tailAnchorPoint.y),
    };
    tailBase = computeBalloonTailBase(bounds, tailTip);
  } else if (
    element.tail !== "none" &&
    (element.tail === "left" ||
      element.tail === "right" ||
      element.tailDirection !== undefined ||
      (typeof element.tailHeight === "number" && element.tailHeight > 0))
  ) {
    const tailLen =
      typeof element.tailHeight === "number" && Number.isFinite(element.tailHeight) && element.tailHeight > 0
        ? element.tailHeight
        : 32;
    const baseW =
      typeof element.tailBase === "number" && Number.isFinite(element.tailBase) && element.tailBase > 0
        ? element.tailBase
        : Math.min(28, width * 0.22);
    const defaultRatio = element.tail === "right" ? 0.72 : 0.28;
    const ratio =
      typeof element.tailXRatio === "number" && Number.isFinite(element.tailXRatio)
        ? element.tailXRatio
        : defaultRatio;
    const endpoints = resolveTailEndpointsFromSpec({
      bounds,
      rotationDeg,
      direction: element.tailDirection ?? "bottom",
      ratio,
      length: tailLen,
      baseWidth: baseW,
      side: element.tail ?? "center",
    });
    tailBase = endpoints.base;
    tailTip = endpoints.tip;
  }

  const extraTailTips: EyeFlowPoint[] = [];
  if (Array.isArray(element.extraTails)) {
    for (const extra of element.extraTails) {
      if (!Number.isFinite(extra.length) || extra.length <= 0) continue;
      const endpoints = resolveTailEndpointsFromSpec({
        bounds,
        rotationDeg,
        direction: extra.direction,
        ratio: Number.isFinite(extra.ratio) ? extra.ratio : 0.5,
        length: extra.length,
        baseWidth: Number.isFinite(extra.base) && extra.base > 0 ? extra.base : 20,
        side: extra.side,
      });
      extraTailTips.push(endpoints.tip);
    }
  }

  return {
    id: element.id?.trim() || `balloon-${fallbackIndex + 1}`,
    bounds,
    readingOrder:
      typeof element.readingOrder === "number" && Number.isFinite(element.readingOrder)
        ? element.readingOrder
        : undefined,
    text: element.text,
    tailBase,
    tailTip,
    extraTailTips: extraTailTips.length > 0 ? extraTailTips : undefined,
  };
}

function extractFaceRegion(
  element: EyeFlowElementLike,
  fallbackIndex: number,
): EyeFlowFaceRegion | null {
  const id = element.id?.trim() || `face-${fallbackIndex + 1}`;
  const label = element.label?.trim() || element.name?.trim() || `캐릭터 ${fallbackIndex + 1}`;

  // 1) 명시적 얼굴 바운딩 박스가 지정된 요소
  if (isValidRect(element.faceBounds)) {
    return {
      id,
      label,
      faceBounds: element.faceBounds,
      eyeBounds: isValidRect(element.eyeBounds) ? element.eyeBounds : undefined,
    };
  }

  // 2) 전용 얼굴 요소(`type: "face"`)
  if (
    element.type === "face" &&
    Number.isFinite(element.x) &&
    Number.isFinite(element.y) &&
    typeof element.width === "number" &&
    element.width > 0 &&
    typeof element.height === "number" &&
    element.height > 0
  ) {
    return {
      id,
      label,
      faceBounds: {
        x: element.x as number,
        y: element.y as number,
        width: element.width,
        height: element.height,
      },
      eyeBounds: isValidRect(element.eyeBounds) ? element.eyeBounds : undefined,
    };
  }

  // 3) 캐릭터·VRM 요소(또는 캐릭터 역할로 태그된 이미지) — 상단 두상/얼굴 비율 영역 추정
  const isCharacterElement =
    CHARACTER_TYPES.has(element.type) ||
    (element.type === "image" &&
      (Boolean(element.vrmScene) ||
        element.layerRole === "character" ||
        element.kind === "character" ||
        Boolean(element.characterId)));

  if (
    isCharacterElement &&
    Number.isFinite(element.x) &&
    Number.isFinite(element.y) &&
    typeof element.width === "number" &&
    element.width > 0 &&
    typeof element.height === "number" &&
    element.height > 0
  ) {
    const x = element.x as number;
    const y = element.y as number;
    const width = element.width;
    const height = element.height;
    return {
      id,
      label,
      faceBounds: {
        x: round2(x + width * 0.25),
        y: round2(y + height * 0.06),
        width: round2(width * 0.5),
        height: round2(height * 0.26),
      },
      eyeBounds: isValidRect(element.eyeBounds) ? element.eyeBounds : undefined,
    };
  }

  return null;
}

/**
 * 단일 ToonStudio 페이지의 말풍선·컷·캐릭터 요소를 추출해 시선 동선 및 얼굴 가림을 분석한다.
 */
export function analyzeStudioPageEyeFlow(
  page: EyeFlowPageLike,
  options?: {
    readonly direction?: EyeFlowReadingDirection;
    readonly patternMode?: EyeFlowPatternMode;
    readonly mobileSpoilerGuard?: Partial<MobileSpoilerGuardConfig>;
    readonly config?: Partial<EyeFlowAnalysisConfig>;
  },
): EyeFlowAnalysisResult {
  const canvasWidth =
    typeof page.canvasW === "number" && Number.isFinite(page.canvasW) && page.canvasW > 0
      ? page.canvasW
      : DEFAULT_CANVAS_W;
  const canvasHeight =
    Number.isFinite(page.canvasH) && page.canvasH > 0 ? page.canvasH : DEFAULT_CANVAS_H;

  const cuts: EyeFlowCutBounds[] = [];
  const balloons: EyeFlowBalloonInput[] = [];
  const faces: EyeFlowFaceRegion[] = [];

  for (let i = 0; i < page.elements.length; i += 1) {
    const element = page.elements[i]!;
    if (!isVisible(element)) continue;

    if (
      CUT_TYPES.has(element.type) &&
      Number.isFinite(element.y) &&
      typeof element.height === "number" &&
      element.height > 0
    ) {
      const cutX = Number.isFinite(element.x) ? (element.x as number) : 0;
      const cutW =
        typeof element.width === "number" && Number.isFinite(element.width) && element.width > 0
          ? element.width
          : canvasWidth;
      cuts.push({
        id: element.id?.trim() || `cut-${cuts.length + 1}`,
        bounds: { x: cutX, y: element.y as number, width: cutW, height: element.height },
        visualDensity01: element.visualDensity01,
        isClimaxBeat: element.isClimaxBeat,
        climaxIntensity01: element.climaxIntensity01,
      });
      continue;
    }

    if (BALLOON_TYPES.has(element.type)) {
      const parsed = extractBalloonInput(element, balloons.length);
      if (parsed) balloons.push(parsed);
      continue;
    }

    const face = extractFaceRegion(element, faces.length);
    if (face) faces.push(face);
  }

  return analyzeEyeFlowAndTailGuard({
    canvasWidth,
    canvasHeight,
    balloons,
    faces,
    cuts,
    direction: options?.direction ?? "ltr-ttb",
    patternMode: options?.patternMode,
    mobileSpoilerGuard: options?.mobileSpoilerGuard,
    config: options?.config,
  });
}

function mapTailCrossingToIssue(
  pageId: string,
  crossing: TailCrossingWarning,
): MultiPageEyeFlowIssue {
  return {
    id: `${pageId}:${crossing.id}`,
    pageId,
    category: "tail-crossing",
    severity: crossing.severity,
    sequenceNumber: crossing.firstSequence,
    messageKo: crossing.messageKo,
    detailKo: crossing.detailKo,
    recommendedTailTip: null,
  };
}

function mapReversalToIssue(pageId: string, segment: EyeFlowSegment): MultiPageEyeFlowIssue {
  return {
    id: `${pageId}:${segment.id}`,
    pageId,
    category: "reversal",
    severity: segment.severity === "critical" ? "critical" : "warning",
    sequenceNumber: segment.toSequence,
    messageKo: segment.messageKo,
    detailKo: segment.detailKo,
    recommendedTailTip: null,
  };
}

function mapOcclusionToIssue(
  pageId: string,
  occlusion: TailOcclusionWarning,
): MultiPageEyeFlowIssue {
  return {
    id: `${pageId}:${occlusion.id}`,
    pageId,
    category: "occlusion",
    severity: occlusion.severity,
    sequenceNumber: occlusion.sequenceNumber,
    messageKo: occlusion.messageKo,
    detailKo: occlusion.detailKo,
    recommendedTailTip: occlusion.recommendedTailTip,
  };
}

/**
 * 독자 뷰 전체 페이지 목록에 대한 시선 동선·꼬리 가림 통합 진단을 계산한다.
 */
export function analyzeReaderPagesEyeFlow(
  pages: readonly EyeFlowPageLike[],
  direction: EyeFlowReadingDirection = "ltr-ttb",
): MultiPageEyeFlowSummary {
  const pageSummaries: MultiPageEyeFlowPageSummary[] = [];
  const byPageId = new Map<string, EyeFlowAnalysisResult>();
  const issues: MultiPageEyeFlowIssue[] = [];
  const spoilerRisks: Array<MobileViewportSpoilerRisk & { readonly pageId: string }> = [];

  let totalBalloons = 0;
  let totalFaces = 0;
  let reversalCount = 0;
  let occlusionCount = 0;
  let tailCrossingCount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let scoredPages = 0;
  let scoreSum = 0;

  for (const page of pages) {
    const analysis = analyzeStudioPageEyeFlow(page, { direction });
    pageSummaries.push({ pageId: page.id, analysis });
    byPageId.set(page.id, analysis);

    totalBalloons += analysis.nodes.length;
    totalFaces += analysis.faces.length;
    reversalCount += analysis.reversals.length;
    occlusionCount += analysis.occlusions.length;
    tailCrossingCount += analysis.tailCrossings.length;
    criticalCount += analysis.criticalCount;
    warningCount += analysis.warningCount;

    if (analysis.nodes.length > 0) {
      scoredPages += 1;
      scoreSum += analysis.score;
    }

    for (const occ of analysis.occlusions) {
      issues.push(mapOcclusionToIssue(page.id, occ));
    }
    for (const cross of analysis.tailCrossings) {
      issues.push(mapTailCrossingToIssue(page.id, cross));
    }
    for (const rev of analysis.reversals) {
      issues.push(mapReversalToIssue(page.id, rev));
    }
    for (const risk of analysis.spoilerRisks) {
      spoilerRisks.push({ ...risk, pageId: page.id });
    }
  }

  // 심각(critical) 항목을 먼저 보여 주어 작가가 눈 가림/꼬리 교차/급격한 역주행부터 바로 고칠 수 있게 한다.
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    if (a.category !== b.category) {
      if (a.category === "occlusion") return -1;
      if (b.category === "occlusion") return 1;
      if (a.category === "tail-crossing") return -1;
      if (b.category === "tail-crossing") return 1;
    }
    return a.sequenceNumber - b.sequenceNumber;
  });

  const rhythmPreviews = buildMultiPageRhythmPreviews(pages);

  const overallScore = scoredPages > 0 ? Math.round(scoreSum / scoredPages) : 100;

  return {
    direction,
    pages: Object.freeze(pageSummaries),
    byPageId,
    issues: Object.freeze(issues),
    spoilerRisks: Object.freeze(spoilerRisks),
    rhythmPreviews,
    totalBalloons,
    totalFaces,
    reversalCount,
    occlusionCount,
    tailCrossingCount,
    spoilerRiskCount: spoilerRisks.length,
    criticalCount,
    warningCount,
    overallScore,
  };
}
