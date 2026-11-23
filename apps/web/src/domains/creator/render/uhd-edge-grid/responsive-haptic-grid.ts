/**
 * 줌 배율 적응형 반응형 햅틱 그리드 엔진 (`metric` · `webtoon-gutter` · `rule-of-thirds` · `golden-ratio`).
 *
 * - 줌 25%~800%(0.25~8.0) 전 구간에서 메이저/마이너 그리드라인을 자동 세분화하되,
 *   시각적 과밀을 막기 위해 인접 선 간 최소 화면 간격(기본 18px)을 수학적으로 보장한다.
 * - 포인터가 그리드 축 ±6px(기본 임계) 이내로 접근하면 자석 스냅을 적용하고,
 *   새로운 축 또는 교차점을 통과할 때 스로틀된 촉각 햅틱 패턴(`patternMs`)을 반환한다.
 * - `devicePixelRatio`가 주어지면 `uhd-dpr-tile-budgeter`의 물리 픽셀 스냅으로
 *   비정수 배율(125%/150%/175%)에서도 1px 선명한 그리드선을 유지한다.
 */

import {
  hairlineStrokeWidthCss,
  normalizeDevicePixelRatio,
  snapStrokeCenterToPhysicalPixel,
} from "./uhd-dpr-tile-budgeter";

export type ResponsiveGridMode =
  | "metric"
  | "webtoon-gutter"
  | "rule-of-thirds"
  | "golden-ratio";

export type GridLineAxis = "x" | "y";
export type GridLineKind = "major" | "minor";

export interface ResponsiveGridLine {
  readonly id: string;
  readonly axis: GridLineAxis;
  readonly kind: GridLineKind;
  /** 뷰포트 기준 CSS px 좌표 (물리 픽셀 스냅 적용 완료) */
  readonly positionPx: number;
  /** 문서 월드 좌표 또는 비율(0~1) 표기용 값 */
  readonly worldCoord: number;
  /** 영문/중립 축 레이블 (EN 모드 한글 누수 방지) */
  readonly label: string;
}

export interface ResponsiveHapticGridInput {
  /** 줌 배율 (0.25 = 25%, 1.0 = 100%, 8.0 = 800%) */
  readonly zoom: number;
  /** 뷰포트 너비 (CSS px) */
  readonly viewportWidth: number;
  /** 뷰포트 높이 (CSS px) */
  readonly viewportHeight: number;
  /** 그리드 모드 */
  readonly mode: ResponsiveGridMode;
  /** 현재 포인터 X (뷰포트 CSS px) */
  readonly pointerX: number;
  /** 현재 포인터 Y (뷰포트 CSS px) */
  readonly pointerY: number;
  /** 직전 프레임에 스냅/교차했던 축 키 (동일 축 중복 햅틱 방지) */
  readonly previousAxisKey?: string | null;
  /** 선택: 디스플레이 DPR (기본 1) */
  readonly devicePixelRatio?: number;
  /** 선택: 최소 그리드 간격 (CSS px, 기본 18) */
  readonly minSpacingPx?: number;
  /** 선택: 자석 스냅 임계 반경 (CSS px, 기본 6) */
  readonly snapThresholdPx?: number;
  /** 선택: 수평 패닝 오프셋 (월드 px, 기본 0) */
  readonly panOffsetX?: number;
  /** 선택: 수직 패닝 오프셋 (월드 px, 기본 0) */
  readonly panOffsetY?: number;
  /** 선택: 현재 타임스탬프 (ms, 햅틱 스로틀 계산용) */
  readonly nowMs?: number;
  /** 선택: 마지막 햅틱 발화 시각 (ms) */
  readonly lastHapticTimestampMs?: number | null;
  /** 선택: 햅틱 최소 스로틀 간격 (ms, 기본 40) */
  readonly hapticThrottleMs?: number;
  /** 선택: 모션 감소 접근성 설정 (true면 햅틱 발화 억제) */
  readonly reducedMotion?: boolean;
}

export interface ResponsiveGridHapticFeedback {
  readonly triggerHaptic: boolean;
  readonly patternMs: readonly number[];
  readonly axisLabel: string | null;
  readonly axisKey: string | null;
  readonly throttled: boolean;
  readonly nextHapticTimestampMs: number | null;
}

export interface ResponsiveGridSnapResult {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly snappedX: number;
  readonly snappedY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly didSnapX: boolean;
  readonly didSnapY: boolean;
  readonly isSnapped: boolean;
  readonly isIntersection: boolean;
  readonly axisKey: string | null;
  readonly matchedVerticalLine: ResponsiveGridLine | null;
  readonly matchedHorizontalLine: ResponsiveGridLine | null;
}

export interface ResponsiveHapticGridResult {
  readonly mode: ResponsiveGridMode;
  readonly zoom: number;
  readonly subdivisionLevel: number;
  readonly minorWorldStep: number;
  readonly majorWorldStep: number;
  readonly minSpacingPx: number;
  readonly minObservedSpacingPx: number | null;
  readonly hairlineStrokeWidthCss: number;
  readonly verticalLines: readonly ResponsiveGridLine[];
  readonly horizontalLines: readonly ResponsiveGridLine[];
  readonly snap: ResponsiveGridSnapResult;
  readonly haptic: ResponsiveGridHapticFeedback;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8.0;
const DEFAULT_MIN_SPACING_PX = 18;
const DEFAULT_SNAP_THRESHOLD_PX = 6;
const DEFAULT_HAPTIC_THROTTLE_MS = 40;

const METRIC_WORLD_STEPS: readonly number[] = [2.5, 5, 10, 20, 40, 80, 160, 320, 640, 1280];
const WEBTOON_CUT_HEIGHT_WORLD = 640;
const WEBTOON_GUTTER_HEIGHT_WORLD = 96;
const PHI_INV = (Math.sqrt(5) - 1) / 2;
const PHI_COMP = 1 - PHI_INV;

const HAPTIC_PATTERN_MINOR: readonly number[] = Object.freeze([6]);
const HAPTIC_PATTERN_MAJOR: readonly number[] = Object.freeze([12]);
const HAPTIC_PATTERN_INTERSECTION: readonly number[] = Object.freeze([10, 24, 14]);
const HAPTIC_PATTERN_MAJOR_INTERSECTION: readonly number[] = Object.freeze([12, 22, 16]);
const HAPTIC_PATTERN_NONE: readonly number[] = Object.freeze([]);

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return value;
}

function snapLinePos(rawCssPos: number, dpr: number): number {
  return snapStrokeCenterToPhysicalPixel(rawCssPos, dpr, 1);
}

/**
 * 메이저 선을 우선 보존하면서 동일 축 인접 선 사이의 최소 간격(`minSpacingPx`)을
 * 엄격히 보장하는 결정론적 필터.
 */
function enforceMinimumSpacing(
  candidates: readonly ResponsiveGridLine[],
  minSpacingPx: number,
  viewportExtent: number,
): readonly ResponsiveGridLine[] {
  const inBounds = candidates.filter(
    (line) => Number.isFinite(line.positionPx) && line.positionPx >= 0 && line.positionPx <= viewportExtent,
  );
  const majors = inBounds
    .filter((line) => line.kind === "major")
    .sort((left, right) => left.positionPx - right.positionPx);
  const minors = inBounds
    .filter((line) => line.kind === "minor")
    .sort((left, right) => left.positionPx - right.positionPx);

  const kept: ResponsiveGridLine[] = [];
  const epsilon = 1e-6;

  for (const major of majors) {
    const conflicts = kept.some((existing) => Math.abs(existing.positionPx - major.positionPx) < minSpacingPx - epsilon);
    if (!conflicts) {
      kept.push(major);
    }
  }

  for (const minor of minors) {
    const conflicts = kept.some((existing) => Math.abs(existing.positionPx - minor.positionPx) < minSpacingPx - epsilon);
    if (!conflicts) {
      kept.push(minor);
    }
  }

  kept.sort((left, right) => left.positionPx - right.positionPx);
  return kept;
}

function pickMetricWorldSteps(zoom: number, minSpacingPx: number, dpr: number): {
  readonly minorWorldStep: number;
  readonly majorWorldStep: number;
  readonly subdivisionLevel: number;
} {
  // 물리 픽셀 스냅으로 인해 최대 1/dpr 만큼 줄어들 수 있는 여유분을 선반영
  const requiredScreenStep = minSpacingPx + 1 / dpr;
  let chosenIndex = METRIC_WORLD_STEPS.length - 1;
  for (let i = 0; i < METRIC_WORLD_STEPS.length; i += 1) {
    const step = METRIC_WORLD_STEPS[i];
    if (step !== undefined && step * zoom >= requiredScreenStep) {
      chosenIndex = i;
      break;
    }
  }
  const minorWorldStep = METRIC_WORLD_STEPS[chosenIndex] ?? 1280;
  const majorWorldStep = minorWorldStep * 4;
  const subdivisionLevel = METRIC_WORLD_STEPS.length - chosenIndex;
  return { minorWorldStep, majorWorldStep, subdivisionLevel };
}

function generateMetricAxisLines(
  axis: GridLineAxis,
  extentPx: number,
  zoom: number,
  panOffsetWorld: number,
  minorWorldStep: number,
  majorWorldStep: number,
  dpr: number,
): ResponsiveGridLine[] {
  const worldStart = panOffsetWorld;
  const worldEnd = panOffsetWorld + extentPx / zoom;
  const firstIndex = Math.ceil(worldStart / minorWorldStep);
  const lastIndex = Math.floor(worldEnd / minorWorldStep);
  const lines: ResponsiveGridLine[] = [];
  const prefix = axis === "x" ? "X" : "Y";

  // 극단적 뷰포트 폭주 방지 상한(최소 18px 보장이므로 일반 8K라도 <= 500선)
  const safeCountLimit = Math.min(lastIndex, firstIndex + 2000);
  for (let index = firstIndex; index <= safeCountLimit; index += 1) {
    const worldCoord = Number((index * minorWorldStep).toFixed(4));
    const rawCss = (worldCoord - panOffsetWorld) * zoom;
    const positionPx = snapLinePos(rawCss, dpr);
    const isMajor = Math.abs(worldCoord / majorWorldStep - Math.round(worldCoord / majorWorldStep)) < 1e-6;
    const kind: GridLineKind = isMajor ? "major" : "minor";
    lines.push({
      id: `${axis}-${kind}-${worldCoord}`,
      axis,
      kind,
      positionPx,
      worldCoord,
      label: `${prefix} ${worldCoord}px`,
    });
  }
  return lines;
}

function generateWebtoonGutterLines(
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  panOffsetY: number,
  minSpacingPx: number,
  dpr: number,
): {
  readonly verticalCandidates: ResponsiveGridLine[];
  readonly horizontalCandidates: ResponsiveGridLine[];
  readonly minorWorldStep: number;
  readonly majorWorldStep: number;
  readonly subdivisionLevel: number;
} {
  const verticalRatios: ReadonlyArray<{ readonly ratio: number; readonly kind: GridLineKind; readonly label: string }> = [
    { ratio: 0.04, kind: "minor", label: "Bleed L" },
    { ratio: 0.08, kind: "major", label: "Safe L" },
    { ratio: 0.25, kind: "minor", label: "Rail 25%" },
    { ratio: 0.5, kind: "major", label: "Spine 50%" },
    { ratio: 0.75, kind: "minor", label: "Rail 75%" },
    { ratio: 0.92, kind: "major", label: "Safe R" },
    { ratio: 0.96, kind: "minor", label: "Bleed R" },
  ];

  const verticalCandidates: ResponsiveGridLine[] = verticalRatios.map((item) => ({
    id: `x-${item.kind}-wt-${Math.round(item.ratio * 100)}`,
    axis: "x",
    kind: item.kind,
    positionPx: snapLinePos(viewportWidth * item.ratio, dpr),
    worldCoord: item.ratio,
    label: item.label,
  }));

  const pitchWorld = WEBTOON_CUT_HEIGHT_WORLD + WEBTOON_GUTTER_HEIGHT_WORLD;
  const subDivisions = zoom >= 3 ? 8 : zoom >= 1.5 ? 4 : zoom >= 0.75 ? 2 : 1;
  const minorWorldStep = WEBTOON_CUT_HEIGHT_WORLD / subDivisions;
  const worldStart = panOffsetY;
  const worldEnd = panOffsetY + viewportHeight / zoom;
  const firstCut = Math.floor(worldStart / pitchWorld);
  const lastCut = Math.ceil(worldEnd / pitchWorld);
  const horizontalCandidates: ResponsiveGridLine[] = [];

  for (let cutIndex = firstCut; cutIndex <= Math.min(lastCut, firstCut + 200); cutIndex += 1) {
    const cutTopWorld = cutIndex * pitchWorld;
    const cutBottomWorld = cutTopWorld + WEBTOON_CUT_HEIGHT_WORLD;
    const gutterMidWorld = cutBottomWorld + WEBTOON_GUTTER_HEIGHT_WORLD * 0.5;

    const cutTopPx = snapLinePos((cutTopWorld - panOffsetY) * zoom, dpr);
    const cutBottomPx = snapLinePos((cutBottomWorld - panOffsetY) * zoom, dpr);
    const gutterMidPx = snapLinePos((gutterMidWorld - panOffsetY) * zoom, dpr);

    horizontalCandidates.push(
      {
        id: `y-major-cut-start-${cutIndex}`,
        axis: "y",
        kind: "major",
        positionPx: cutTopPx,
        worldCoord: cutTopWorld,
        label: `Cut #${cutIndex + 1} Top`,
      },
      {
        id: `y-major-cut-end-${cutIndex}`,
        axis: "y",
        kind: "major",
        positionPx: cutBottomPx,
        worldCoord: cutBottomWorld,
        label: `Cut #${cutIndex + 1} Gutter`,
      },
      {
        id: `y-minor-gutter-mid-${cutIndex}`,
        axis: "y",
        kind: "minor",
        positionPx: gutterMidPx,
        worldCoord: gutterMidWorld,
        label: `Gutter #${cutIndex + 1} Mid`,
      },
    );

    if (minorWorldStep * zoom >= minSpacingPx) {
      for (let sub = 1; sub < subDivisions; sub += 1) {
        const beatWorld = cutTopWorld + sub * minorWorldStep;
        horizontalCandidates.push({
          id: `y-minor-beat-${cutIndex}-${sub}`,
          axis: "y",
          kind: "minor",
          positionPx: snapLinePos((beatWorld - panOffsetY) * zoom, dpr),
          worldCoord: beatWorld,
          label: `Cut #${cutIndex + 1} Beat ${sub}/${subDivisions}`,
        });
      }
    }
  }

  return {
    verticalCandidates,
    horizontalCandidates,
    minorWorldStep,
    majorWorldStep: pitchWorld,
    subdivisionLevel: subDivisions,
  };
}

function generateProportionalAxisLines(
  axis: GridLineAxis,
  extentPx: number,
  specs: ReadonlyArray<{ readonly ratio: number; readonly kind: GridLineKind; readonly label: string }>,
  dpr: number,
): ResponsiveGridLine[] {
  const prefix = axis === "x" ? "X" : "Y";
  return specs.map((spec) => ({
    id: `${axis}-${spec.kind}-ratio-${Math.round(spec.ratio * 1000)}`,
    axis,
    kind: spec.kind,
    positionPx: snapLinePos(extentPx * spec.ratio, dpr),
    worldCoord: Number(spec.ratio.toFixed(4)),
    label: `${prefix} ${spec.label}`,
  }));
}

function findNearestLine(
  lines: readonly ResponsiveGridLine[],
  pointerCoord: number,
  thresholdPx: number,
): ResponsiveGridLine | null {
  let best: ResponsiveGridLine | null = null;
  let bestDist = thresholdPx + 1e-9;

  for (const line of lines) {
    const dist = Math.abs(pointerCoord - line.positionPx);
    if (dist < bestDist - 1e-9) {
      best = line;
      bestDist = dist;
    } else if (Math.abs(dist - bestDist) <= 1e-9 && best && line.kind === "major" && best.kind === "minor") {
      // 동일 거리면 메이저 선 우선
      best = line;
    }
  }
  return best;
}

function measureMinAxisSpacing(lines: readonly ResponsiveGridLine[]): number | null {
  if (lines.length < 2) return null;
  let minGap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < lines.length; i += 1) {
    const curr = lines[i];
    const prev = lines[i - 1];
    if (curr && prev) {
      const gap = curr.positionPx - prev.positionPx;
      if (gap < minGap) minGap = gap;
    }
  }
  return Number.isFinite(minGap) ? Number(minGap.toFixed(4)) : null;
}

interface GeneratedGridModeCandidates {
  readonly verticalCandidates: readonly ResponsiveGridLine[];
  readonly horizontalCandidates: readonly ResponsiveGridLine[];
  readonly minorWorldStep: number;
  readonly majorWorldStep: number;
  readonly subdivisionLevel: number;
}

function buildGridModeCandidates(
  mode: ResponsiveGridMode,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  panOffsetX: number,
  panOffsetY: number,
  minSpacingPx: number,
  dpr: number,
): GeneratedGridModeCandidates {
  if (mode === "metric") {
    const steps = pickMetricWorldSteps(zoom, minSpacingPx, dpr);
    return {
      verticalCandidates: generateMetricAxisLines(
        "x",
        viewportWidth,
        zoom,
        panOffsetX,
        steps.minorWorldStep,
        steps.majorWorldStep,
        dpr,
      ),
      horizontalCandidates: generateMetricAxisLines(
        "y",
        viewportHeight,
        zoom,
        panOffsetY,
        steps.minorWorldStep,
        steps.majorWorldStep,
        dpr,
      ),
      minorWorldStep: steps.minorWorldStep,
      majorWorldStep: steps.majorWorldStep,
      subdivisionLevel: steps.subdivisionLevel,
    };
  }
  if (mode === "webtoon-gutter") {
    return generateWebtoonGutterLines(viewportWidth, viewportHeight, zoom, panOffsetY, minSpacingPx, dpr);
  }
  if (mode === "rule-of-thirds") {
    let subdivisionLevel = 1;
    const specs: Array<{ readonly ratio: number; readonly kind: GridLineKind; readonly label: string }> = [
      { ratio: 1 / 3, kind: "major", label: "Third 1/3" },
      { ratio: 2 / 3, kind: "major", label: "Third 2/3" },
    ];
    if (zoom >= 1.25) {
      subdivisionLevel = 2;
      specs.push(
        { ratio: 1 / 9, kind: "minor", label: "Sub 1/9" },
        { ratio: 2 / 9, kind: "minor", label: "Sub 2/9" },
        { ratio: 4 / 9, kind: "minor", label: "Sub 4/9" },
        { ratio: 5 / 9, kind: "minor", label: "Sub 5/9" },
        { ratio: 7 / 9, kind: "minor", label: "Sub 7/9" },
        { ratio: 8 / 9, kind: "minor", label: "Sub 8/9" },
      );
    }
    if (zoom >= 2.5) {
      subdivisionLevel = 3;
      specs.push({ ratio: 0.5, kind: "minor", label: "Center 1/2" });
    }
    return {
      verticalCandidates: generateProportionalAxisLines("x", viewportWidth, specs, dpr),
      horizontalCandidates: generateProportionalAxisLines("y", viewportHeight, specs, dpr),
      minorWorldStep: Number((1 / (subdivisionLevel >= 2 ? 9 : 3)).toFixed(4)),
      majorWorldStep: Number((1 / 3).toFixed(4)),
      subdivisionLevel,
    };
  }
  // golden-ratio
  let subdivisionLevel = 1;
  const specs: Array<{ readonly ratio: number; readonly kind: GridLineKind; readonly label: string }> = [
    { ratio: PHI_COMP, kind: "major", label: "Phi 38.2%" },
    { ratio: PHI_INV, kind: "major", label: "Phi 61.8%" },
  ];
  if (zoom >= 1.25) {
    subdivisionLevel = 2;
    const harmonicOuter = PHI_COMP * PHI_INV;
    specs.push(
      { ratio: harmonicOuter, kind: "minor", label: "Phi 23.6%" },
      { ratio: 0.5, kind: "minor", label: "Center 50%" },
      { ratio: 1 - harmonicOuter, kind: "minor", label: "Phi 76.4%" },
    );
  }
  if (zoom >= 2.5) {
    subdivisionLevel = 3;
    const deepHarmonic = PHI_COMP * PHI_COMP;
    specs.push(
      { ratio: deepHarmonic, kind: "minor", label: "Phi 14.6%" },
      { ratio: 1 - deepHarmonic, kind: "minor", label: "Phi 85.4%" },
    );
  }
  return {
    verticalCandidates: generateProportionalAxisLines("x", viewportWidth, specs, dpr),
    horizontalCandidates: generateProportionalAxisLines("y", viewportHeight, specs, dpr),
    minorWorldStep: Number((PHI_COMP * PHI_INV).toFixed(4)),
    majorWorldStep: Number(PHI_COMP.toFixed(4)),
    subdivisionLevel,
  };
}

/**
 * 현재 줌 배율, 뷰포트 크기, 모드, 포인터 위치로부터
 * 최소 간격(>=18px) 보장 그리드라인, 자석 스냅 좌표, 스로틀된 촉각 햅틱 패턴을 계산한다.
 */
export function computeResponsiveHapticGrid(input: ResponsiveHapticGridInput): ResponsiveHapticGridResult {
  const zoom = clampNumber(input.zoom, 1, MIN_ZOOM, MAX_ZOOM);
  const viewportWidth = clampNumber(input.viewportWidth, 1280, 1, 32768);
  const viewportHeight = clampNumber(input.viewportHeight, 720, 1, 32768);
  const pointerX = finiteOr(input.pointerX, 0);
  const pointerY = finiteOr(input.pointerY, 0);
  const dpr = normalizeDevicePixelRatio(input.devicePixelRatio ?? 1);
  const minSpacingPx = clampNumber(input.minSpacingPx, DEFAULT_MIN_SPACING_PX, 4, 256);
  const snapThresholdPx = clampNumber(input.snapThresholdPx, DEFAULT_SNAP_THRESHOLD_PX, 0, 48);
  const panOffsetX = finiteOr(input.panOffsetX, 0);
  const panOffsetY = finiteOr(input.panOffsetY, 0);
  const hapticThrottleMs = clampNumber(input.hapticThrottleMs, DEFAULT_HAPTIC_THROTTLE_MS, 0, 2000);
  const reducedMotion = Boolean(input.reducedMotion);

  const {
    verticalCandidates,
    horizontalCandidates,
    minorWorldStep,
    majorWorldStep,
    subdivisionLevel,
  } = buildGridModeCandidates(
    input.mode,
    zoom,
    viewportWidth,
    viewportHeight,
    panOffsetX,
    panOffsetY,
    minSpacingPx,
    dpr,
  );

  const verticalLines = enforceMinimumSpacing(verticalCandidates, minSpacingPx, viewportWidth);
  const horizontalLines = enforceMinimumSpacing(horizontalCandidates, minSpacingPx, viewportHeight);

  const matchedVerticalLine = findNearestLine(verticalLines, pointerX, snapThresholdPx);
  const matchedHorizontalLine = findNearestLine(horizontalLines, pointerY, snapThresholdPx);

  const didSnapX = matchedVerticalLine !== null;
  const didSnapY = matchedHorizontalLine !== null;
  const snappedX = matchedVerticalLine ? matchedVerticalLine.positionPx : pointerX;
  const snappedY = matchedHorizontalLine ? matchedHorizontalLine.positionPx : pointerY;
  const isIntersection = didSnapX && didSnapY;
  const isSnapped = didSnapX || didSnapY;

  let axisKey: string | null = null;
  let axisLabel: string | null = null;
  let candidatePattern: readonly number[] = HAPTIC_PATTERN_NONE;

  if (matchedVerticalLine && matchedHorizontalLine) {
    axisKey = `xy:${matchedVerticalLine.id}|${matchedHorizontalLine.id}`;
    axisLabel = `${matchedVerticalLine.label} x ${matchedHorizontalLine.label}`;
    candidatePattern =
      matchedVerticalLine.kind === "major" && matchedHorizontalLine.kind === "major"
        ? HAPTIC_PATTERN_MAJOR_INTERSECTION
        : HAPTIC_PATTERN_INTERSECTION;
  } else if (matchedVerticalLine) {
    axisKey = `x:${matchedVerticalLine.id}`;
    axisLabel = matchedVerticalLine.label;
    candidatePattern = matchedVerticalLine.kind === "major" ? HAPTIC_PATTERN_MAJOR : HAPTIC_PATTERN_MINOR;
  } else if (matchedHorizontalLine) {
    axisKey = `y:${matchedHorizontalLine.id}`;
    axisLabel = matchedHorizontalLine.label;
    candidatePattern = matchedHorizontalLine.kind === "major" ? HAPTIC_PATTERN_MAJOR : HAPTIC_PATTERN_MINOR;
  }

  const prevKey = input.previousAxisKey ?? null;
  const crossedNewAxis = axisKey !== null && axisKey !== prevKey;
  const nowMs = input.nowMs !== undefined && Number.isFinite(input.nowMs) ? input.nowMs : null;
  const lastHapticMs =
    input.lastHapticTimestampMs !== undefined &&
    input.lastHapticTimestampMs !== null &&
    Number.isFinite(input.lastHapticTimestampMs)
      ? input.lastHapticTimestampMs
      : null;
  const throttled = crossedNewAxis && nowMs !== null && lastHapticMs !== null && nowMs - lastHapticMs < hapticThrottleMs;
  const triggerHaptic = crossedNewAxis && !throttled && !reducedMotion;

  const nextHapticTimestampMs = triggerHaptic ? nowMs : lastHapticMs;

  const minXGap = measureMinAxisSpacing(verticalLines);
  const minYGap = measureMinAxisSpacing(horizontalLines);
  const minObservedSpacingPx =
    minXGap !== null && minYGap !== null
      ? Math.min(minXGap, minYGap)
      : (minXGap ?? minYGap);

  return {
    mode: input.mode,
    zoom,
    subdivisionLevel,
    minorWorldStep,
    majorWorldStep,
    minSpacingPx,
    minObservedSpacingPx,
    hairlineStrokeWidthCss: hairlineStrokeWidthCss(dpr),
    verticalLines,
    horizontalLines,
    snap: {
      pointerX,
      pointerY,
      snappedX,
      snappedY,
      deltaX: Number((snappedX - pointerX).toFixed(4)),
      deltaY: Number((snappedY - pointerY).toFixed(4)),
      didSnapX,
      didSnapY,
      isSnapped,
      isIntersection,
      axisKey,
      matchedVerticalLine,
      matchedHorizontalLine,
    },
    haptic: {
      triggerHaptic,
      patternMs: triggerHaptic ? candidatePattern : HAPTIC_PATTERN_NONE,
      axisLabel,
      axisKey,
      throttled,
      nextHapticTimestampMs,
    },
  };
}

/** 브라우저 지원 환경에서 햅틱 패턴을 안전하게 송출한다(SSR·미지원 환경 무해 폴백). */
export function dispatchGridHapticFeedback(
  haptic: ResponsiveGridHapticFeedback,
  navigatorLike?: { readonly vibrate?: (pattern: number | readonly number[]) => boolean },
): boolean {
  if (!haptic.triggerHaptic || haptic.patternMs.length === 0) return false;
  const nav = navigatorLike ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (!nav || typeof nav.vibrate !== "function") return false;
  try {
    return nav.vibrate([...haptic.patternMs]);
  } catch {
    return false;
  }
}
