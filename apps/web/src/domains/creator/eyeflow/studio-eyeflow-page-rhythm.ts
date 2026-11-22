/**
 * ToonStudio 페이지 단위 컷 리듬·거터 계산 및 1클릭 3종 리듬 변환 적용 어댑터.
 *
 * `studio-eyeflow-page-adapter.ts`에서 호출되며, `studio-eyeflow-rhythm-solver.ts`의
 * 순수 컷 리듬·390×844 모바일 스포일러 방지 가드를 페이지 요소 좌표에 비파괴적으로 적용한다.
 */

import { clamp, round2 } from "./studio-eyeflow-primitives";
import {
  CUT_RHYTHM_PRESET_LIST,
  computeAutoCutRhythmPlan,
  type AutoCutRhythmInput,
  type AutoCutRhythmPlanResult,
} from "./studio-eyeflow-rhythm-solver";
import type {
  CutRhythmPresetId,
  EyeFlowBalloonInput,
  EyeFlowRect,
  MobileSpoilerGuardConfig,
} from "./studio-eyeflow-types";

export interface RhythmPageElementLike {
  readonly id?: string;
  readonly type: string;
  readonly hidden?: boolean;
  readonly opacity?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly text?: string;
  readonly readingOrder?: number;
  readonly tailAnchorPoint?: { readonly x: number; readonly y: number };
  readonly faceBounds?: EyeFlowRect;
  readonly eyeBounds?: EyeFlowRect;
  readonly visualDensity01?: number;
  readonly isClimaxBeat?: boolean;
  readonly climaxIntensity01?: number;
}

export interface RhythmPageLike {
  readonly id: string;
  readonly canvasH: number;
  readonly canvasW?: number;
  readonly elements: readonly RhythmPageElementLike[];
}

export interface MultiPageRhythmPresetPreview {
  readonly preset: CutRhythmPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly averageGutterPx: number;
  readonly totalHeightDeltaPx: number;
  readonly guardedTransitionCount: number;
  readonly remainingSpoilerRiskCount: number;
  readonly summaryKo: string;
}

const DEFAULT_CANVAS_W = 720;
const DEFAULT_BALLOON_W = 160;
const DEFAULT_BALLOON_H = 72;
const CUT_TYPES = new Set(["frame", "panel"]);
const BALLOON_TYPES = new Set(["bubble", "dialogue", "caption"]);

function isVisibleElement(element: RhythmPageElementLike): boolean {
  if (element.hidden === true) return false;
  if (typeof element.opacity === "number" && element.opacity <= 0) return false;
  return true;
}

function buildCutRhythmInputsForPage(page: RhythmPageLike): {
  readonly canvasWidth: number;
  readonly cuts: readonly AutoCutRhythmInput[];
} {
  const canvasWidth =
    typeof page.canvasW === "number" && Number.isFinite(page.canvasW) && page.canvasW > 0
      ? page.canvasW
      : DEFAULT_CANVAS_W;

  const rawCuts: Array<{
    readonly id: string;
    readonly bounds: EyeFlowRect;
    readonly explicitDensity?: number;
    readonly isClimaxBeat?: boolean;
    readonly climaxIntensity01?: number;
  }> = [];
  const balloons: EyeFlowBalloonInput[] = [];
  const visibleNonCutRects: EyeFlowRect[] = [];

  for (let i = 0; i < page.elements.length; i += 1) {
    const element = page.elements[i]!;
    if (!isVisibleElement(element)) continue;

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
      rawCuts.push({
        id: element.id?.trim() || `cut-${rawCuts.length + 1}`,
        bounds: { x: cutX, y: element.y as number, width: cutW, height: element.height },
        explicitDensity: element.visualDensity01,
        isClimaxBeat: element.isClimaxBeat,
        climaxIntensity01: element.climaxIntensity01,
      });
      continue;
    }

    if (BALLOON_TYPES.has(element.type) && Number.isFinite(element.y)) {
      const x = Number.isFinite(element.x) ? (element.x as number) : 0;
      const width =
        typeof element.width === "number" && Number.isFinite(element.width) && element.width > 0
          ? element.width
          : DEFAULT_BALLOON_W;
      const height =
        typeof element.height === "number" && Number.isFinite(element.height) && element.height > 0
          ? element.height
          : DEFAULT_BALLOON_H;
      balloons.push({
        id: element.id?.trim() || `balloon-${balloons.length + 1}`,
        bounds: { x, y: element.y as number, width, height },
        readingOrder:
          typeof element.readingOrder === "number" && Number.isFinite(element.readingOrder)
            ? element.readingOrder
            : undefined,
        text: element.text,
      });
      continue;
    }

    if (
      Number.isFinite(element.x) &&
      Number.isFinite(element.y) &&
      typeof element.width === "number" &&
      element.width > 0 &&
      typeof element.height === "number" &&
      element.height > 0
    ) {
      visibleNonCutRects.push({
        x: element.x as number,
        y: element.y as number,
        width: element.width,
        height: element.height,
      });
    }
  }

  const cuts: AutoCutRhythmInput[] = rawCuts.map((cut) => {
    const cutBalloons = balloons.filter((balloon) => {
      const cy = balloon.bounds.y + balloon.bounds.height / 2;
      return cy >= cut.bounds.y && cy <= cut.bounds.y + cut.bounds.height;
    });
    const dialogueCharCount = cutBalloons.reduce(
      (sum, balloon) => sum + (balloon.text ?? "").replace(/\s+/gu, "").length,
      0,
    );
    const cutArea = Math.max(1, cut.bounds.width * cut.bounds.height);
    const insideArea = visibleNonCutRects.reduce((sum, rect) => {
      const cy = rect.y + rect.height / 2;
      if (cy < cut.bounds.y || cy > cut.bounds.y + cut.bounds.height) return sum;
      return sum + rect.width * rect.height;
    }, 0);
    const inferredDensity = clamp(insideArea / cutArea + cutBalloons.length * 0.12, 0.15, 0.95);
    const visualDensity01 =
      typeof cut.explicitDensity === "number" && Number.isFinite(cut.explicitDensity)
        ? clamp(cut.explicitDensity, 0, 1)
        : round2(inferredDensity);
    return {
      id: cut.id,
      bounds: cut.bounds,
      visualDensity01,
      dialogueCharCount,
      balloonCount: cutBalloons.length,
      isClimaxBeat: cut.isClimaxBeat,
      climaxIntensity01: cut.climaxIntensity01,
      balloons: cutBalloons,
    };
  });

  return { canvasWidth, cuts };
}

/**
 * 단일 ToonStudio 페이지의 컷 밀도·대사량·클라이맥스·390×844 스포일러 가드를 계산한다.
 */
export function computeStudioPageRhythmPlan(
  page: RhythmPageLike,
  preset: CutRhythmPresetId | "balanced" = "balanced",
  options?: {
    readonly enableMobileSpoilerGuard?: boolean;
    readonly mobileSpoilerGuard?: Partial<MobileSpoilerGuardConfig>;
  },
): AutoCutRhythmPlanResult {
  const { canvasWidth, cuts } = buildCutRhythmInputsForPage(page);
  return computeAutoCutRhythmPlan({
    canvasWidth,
    cuts,
    preset,
    enableMobileSpoilerGuard: options?.enableMobileSpoilerGuard,
    mobileSpoilerGuard: options?.mobileSpoilerGuard,
  });
}

/**
 * 1클릭 3종 리듬 변환(`긴장 고조` / `코미디 템포` / `감정 여운`)과 390×844 스포일러 가드를
 * 페이지 컷·말풍선·요소 좌표에 비파괴적으로 적용한 새 페이지 사본을 반환한다.
 */
export function applyRhythmPresetToEyeFlowPage<T extends RhythmPageLike>(
  page: T,
  preset: CutRhythmPresetId,
  options?: {
    readonly enableMobileSpoilerGuard?: boolean;
    readonly mobileSpoilerGuard?: Partial<MobileSpoilerGuardConfig>;
  },
): { readonly page: T; readonly plan: AutoCutRhythmPlanResult } {
  const plan = computeStudioPageRhythmPlan(page, preset, options);
  if (plan.repositionedCuts.length === 0) {
    return { page, plan };
  }

  const cutDeltaById = new Map<string, number>();
  const cutLayoutList = plan.repositionedCuts;
  for (const layout of cutLayoutList) {
    cutDeltaById.set(layout.cutId, layout.deltaY);
  }

  let fallbackCutIdx = 0;
  const nextElements = page.elements.map((element) => {
    if (
      CUT_TYPES.has(element.type) &&
      Number.isFinite(element.y) &&
      typeof element.height === "number" &&
      element.height > 0
    ) {
      const cutId = element.id?.trim() || `cut-${fallbackCutIdx + 1}`;
      fallbackCutIdx += 1;
      const deltaY = cutDeltaById.get(cutId) ?? 0;
      if (Math.abs(deltaY) < 1e-4) return element;
      return { ...element, y: round2((element.y as number) + deltaY) };
    }

    if (!Number.isFinite(element.y)) return element;
    const elemH =
      typeof element.height === "number" && Number.isFinite(element.height) && element.height > 0
        ? element.height
        : 0;
    const centerY = (element.y as number) + elemH / 2;
    const owner = cutLayoutList.find(
      (layout) =>
        centerY >= layout.originalBounds.y &&
        centerY <= layout.originalBounds.y + layout.originalBounds.height,
    );
    if (!owner || Math.abs(owner.deltaY) < 1e-4) return element;

    return {
      ...element,
      y: round2((element.y as number) + owner.deltaY),
      tailAnchorPoint: element.tailAnchorPoint
        ? { x: element.tailAnchorPoint.x, y: round2(element.tailAnchorPoint.y + owner.deltaY) }
        : undefined,
      faceBounds: element.faceBounds
        ? { ...element.faceBounds, y: round2(element.faceBounds.y + owner.deltaY) }
        : undefined,
      eyeBounds: element.eyeBounds
        ? { ...element.eyeBounds, y: round2(element.eyeBounds.y + owner.deltaY) }
        : undefined,
    };
  });

  const lastCut = cutLayoutList[cutLayoutList.length - 1]!;
  const requiredBottom = Math.ceil(lastCut.nextBounds.y + lastCut.nextBounds.height + 40);
  const nextCanvasH = Math.max(page.canvasH, requiredBottom);

  return {
    page: {
      ...page,
      canvasH: nextCanvasH,
      elements: nextElements,
    },
    plan,
  };
}

/**
 * 다중 페이지에 대한 1클릭 3종 리듬 변환 미리보기 요약을 생성한다.
 */
export function buildMultiPageRhythmPreviews(
  pages: readonly RhythmPageLike[],
): readonly MultiPageRhythmPresetPreview[] {
  return Object.freeze(
    CUT_RHYTHM_PRESET_LIST.map((descriptor) => {
      let gutterSum = 0;
      let gutterCount = 0;
      let heightDelta = 0;
      let guardedTransitions = 0;
      let remainingRisks = 0;

      for (const page of pages) {
        const plan = computeStudioPageRhythmPlan(page, descriptor.id, {
          enableMobileSpoilerGuard: true,
        });
        for (const g of plan.gutters) {
          gutterSum += g.finalGutterPx;
          gutterCount += 1;
          if (g.spoilerGuardAddedPx > 0) guardedTransitions += 1;
        }
        heightDelta += Math.round(plan.totalHeightAfterPx - plan.totalHeightBeforePx);
        remainingRisks += plan.spoilerRisksAfterCount;
      }

      const averageGutterPx =
        gutterCount > 0 ? Math.round(gutterSum / gutterCount) : descriptor.baseGutterPx;
      return {
        preset: descriptor.id,
        labelKo: descriptor.labelKo,
        descriptionKo: descriptor.descriptionKo,
        averageGutterPx,
        totalHeightDeltaPx: heightDelta,
        guardedTransitionCount: guardedTransitions,
        remainingSpoilerRiskCount: remainingRisks,
        summaryKo:
          gutterCount > 0
            ? `평균 거터 ${averageGutterPx}px · 390×844 스포일러 보정 ${guardedTransitions}구간`
            : `기본 거터 ${descriptor.baseGutterPx}px (${descriptor.labelKo})`,
      };
    }),
  );
}
