/**
 * Pressure response profiles and cardinal pressure-path planners (batch + incremental)
 * for highlighter and luminous FX brushes.
 */

import {
  STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1,
  applyStudioMaterialMinimumDiameterRatio,
  type StudioMaterialPressureModel,
} from "../studio-material-pressure-model";

import {
  POINT_EPS,
  clamp,
  finiteNumber,
  safeCoord,
} from "./studio-fx-brush-sampling";

export type StudioFxPressureBrushId =
  | "highlighter"
  | "chisel-highlighter"
  | "pastel-highlighter"
  | "neon"
  | "glow"
  | "soft-glow";

export interface StudioFxBrushPressureResponse {
  readonly pressure: number;
  /** Selected toolbar diameter multiplier. Highlighters deliberately keep this range narrow. */
  readonly widthScale: number;
  /** Local pigment/light energy multiplier before whole-element opacity. */
  readonly opacityScale: number;
  /** Outer halo multiplier. Neutral pressure is exactly one for legacy/mouse appearance parity. */
  readonly haloScale: number;
}

export type StudioFxPressurePathSegment =
  | (StudioFxBrushPressureResponse & {
      readonly command: "line";
      readonly moveX: number;
      readonly moveY: number;
      readonly endX: number;
      readonly endY: number;
      readonly sourceSegmentIndex: number;
    })
  | (StudioFxBrushPressureResponse & {
      readonly command: "quadratic";
      readonly moveX: number;
      readonly moveY: number;
      readonly controlX: number;
      readonly controlY: number;
      readonly endX: number;
      readonly endY: number;
      readonly sourceSegmentIndex: number;
    })
  | (StudioFxBrushPressureResponse & {
      readonly command: "cubic";
      readonly moveX: number;
      readonly moveY: number;
      readonly control1X: number;
      readonly control1Y: number;
      readonly control2X: number;
      readonly control2Y: number;
      readonly endX: number;
      readonly endY: number;
      readonly sourceSegmentIndex: number;
    });

export interface StudioFxPressurePathPlan {
  readonly kind: "studio-fx-pressure-path";
  readonly brushId: StudioFxPressureBrushId;
  readonly sourcePointCount: number;
  readonly segments: readonly StudioFxPressurePathSegment[];
}

export interface StudioFxPressurePassResponse {
  /** Complete multiplier applied to the pass' existing width scale. */
  readonly widthScale: number;
  /** Complete multiplier applied to the pass' existing opacity. */
  readonly opacityScale: number;
}

export interface StudioIncrementalFxPressurePathBuilder {
  /**
   * 자라나는 획의 현재 스냅샷을 소비하고 전체 압력 경로 플랜을 돌려준다. 이미 소비한 raw
   * prefix는 다시 읽지 않으며(마지막 소비 점·필압 슬롯 하나로 O(1) 검증), 되돌리기/재작성이
   * 감지되면 전체를 다시 만든다. 반환 플랜의 `segments`는 빌더 내부 보관 배열이므로 수정하면
   * 안 된다.
   */
  append(input: {
    readonly brushId: StudioFxPressureBrushId;
    readonly points: readonly number[];
    readonly pressures?: readonly number[] | null;
    readonly pressureModel?: StudioMaterialPressureModel;
    readonly minimumDiameterRatio?: unknown;
    readonly tension?: unknown;
  }): StudioFxPressurePathPlan;
  /**
   * 마지막 `append()`가 돌려준 `segments`에서 앞으로 어떤 append도 다시 쓰지 않는 안정 prefix
   * 길이. 그 뒤(휘발 꼬리 ≤ 3 + 아주 짧은 획 특례)는 다음 호출이 다시 방출할 수 있으므로,
   * 하류 증분 소비자는 이 길이까지만 세그먼트를 신뢰해야 한다.
   */
  stableSegmentCount(): number;
  /** 전체 재구축(리셋)마다 증가한다 — 하류 증분 소비자의 prefix 신뢰를 무효화하는 신호. */
  generation(): number;
}

interface FxPressureAxis {
  readonly light: number;
  readonly heavy: number;
  readonly curve: number;
}

interface FxPressureProfile {
  readonly width: FxPressureAxis;
  readonly opacity: FxPressureAxis;
  readonly halo: FxPressureAxis;
}

const FX_PRESSURE_PROFILE: Readonly<
  Record<StudioFxPressureBrushId, FxPressureProfile>
> = {
  highlighter: {
    // A marker nib is physically rigid. Pressure primarily changes ink delivery, not its footprint.
    width: { light: 0.94, heavy: 1.08, curve: 0.72 },
    opacity: { light: 0.46, heavy: 1.08, curve: 0.84 },
    halo: { light: 1, heavy: 1, curve: 1 },
  },
  "chisel-highlighter": {
    width: { light: 0.97, heavy: 1.04, curve: 0.76 },
    opacity: { light: 0.42, heavy: 1.1, curve: 0.86 },
    halo: { light: 1, heavy: 1, curve: 1 },
  },
  "pastel-highlighter": {
    width: { light: 0.9, heavy: 1.14, curve: 0.78 },
    opacity: { light: 0.34, heavy: 1.14, curve: 0.92 },
    halo: { light: 1, heavy: 1, curve: 1 },
  },
  neon: {
    width: { light: 0.72, heavy: 1.24, curve: 0.82 },
    opacity: { light: 0.42, heavy: 1.1, curve: 0.88 },
    halo: { light: 0.82, heavy: 1.42, curve: 0.78 },
  },
  glow: {
    width: { light: 0.72, heavy: 1.3, curve: 0.84 },
    opacity: { light: 0.34, heavy: 1.14, curve: 0.92 },
    halo: { light: 0.78, heavy: 1.54, curve: 0.76 },
  },
  "soft-glow": {
    width: { light: 0.8, heavy: 1.36, curve: 0.82 },
    opacity: { light: 0.28, heavy: 1.12, curve: 0.94 },
    halo: { light: 0.86, heavy: 1.68, curve: 0.74 },
  },
};

const FX_PRESSURE_LEGACY_NEUTRAL = 0.5;
const FX_PRESSURE_CURRENT_NOMINAL = 0.8;
const FX_PRESSURE_PATH_VOLATILE_TAIL_SEGMENTS = 3;

function centeredFxPressureResponse(
  pressure: number,
  axis: FxPressureAxis,
): number {
  if (pressure <= FX_PRESSURE_CURRENT_NOMINAL) {
    const amount = Math.pow(
      pressure / FX_PRESSURE_CURRENT_NOMINAL,
      axis.curve,
    );
    return axis.light + (1 - axis.light) * amount;
  }
  const amount = Math.pow(
    (pressure - FX_PRESSURE_CURRENT_NOMINAL)
      / (1 - FX_PRESSURE_CURRENT_NOMINAL),
    axis.curve,
  );
  return 1 + (axis.heavy - 1) * amount;
}

export function isStudioFxPressureBrushId(
  value: unknown,
): value is StudioFxPressureBrushId {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(FX_PRESSURE_PROFILE, value);
}

/**
 * Maps the already-canonical `DrawEl.pressures` channel to material response. No velocity
 * inference lives here: input, replay, collaboration and export therefore receive the same value.
 */
export function resolveStudioFxBrushPressureResponse(
  brushId: StudioFxPressureBrushId,
  pressureInput: unknown,
  minimumDiameterRatio?: unknown,
): StudioFxBrushPressureResponse {
  const pressure = clamp(
    finiteNumber(pressureInput, FX_PRESSURE_CURRENT_NOMINAL),
    0,
    1,
  );
  const profile = FX_PRESSURE_PROFILE[brushId];
  return Object.freeze({
    pressure,
    widthScale: applyStudioMaterialMinimumDiameterRatio(
      centeredFxPressureResponse(pressure, profile.width),
      minimumDiameterRatio,
    ),
    opacityScale: centeredFxPressureResponse(pressure, profile.opacity),
    haloScale: centeredFxPressureResponse(pressure, profile.halo),
  });
}

function neutralStudioFxBrushPressureResponse(
  pressure = FX_PRESSURE_LEGACY_NEUTRAL,
): StudioFxBrushPressureResponse {
  return Object.freeze({
    pressure,
    widthScale: 1,
    opacityScale: 1,
    haloScale: 1,
  });
}

/**
 * A missing version field is a persisted legacy mark and therefore keeps the selected toolbar
 * appearance. Canonical-v1 interprets every stored pressure, including an exact stylus 0.5.
 */
export function resolveStudioFxBrushTapPressureResponse(
  brushId: StudioFxPressureBrushId,
  pressureInput: unknown,
  pressureModel?: StudioMaterialPressureModel,
  minimumDiameterRatio?: unknown,
): StudioFxBrushPressureResponse {
  return pressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
    ? resolveStudioFxBrushPressureResponse(
        brushId,
        pressureInput,
        minimumDiameterRatio,
      )
    : neutralStudioFxBrushPressureResponse();
}

/**
 * Outer luminous passes react more through radius, while the innermost core reacts through nib
 * width. Both Canvas and SVG call this exact function, preventing a pressure-dependent handoff pop.
 */
export function resolveStudioFxPressurePassResponse(
  pressure: StudioFxBrushPressureResponse,
  passWidthScale: number,
  luminousCore: boolean,
): StudioFxPressurePassResponse {
  const haloWeight = luminousCore
    ? 0
    : clamp((finiteNumber(passWidthScale, 1) - 0.8) / 3.4, 0, 1);
  return Object.freeze({
    widthScale:
      pressure.widthScale
      + (pressure.haloScale - pressure.widthScale) * haloWeight,
    opacityScale: luminousCore
      ? Math.sqrt(pressure.opacityScale)
      : pressure.opacityScale,
  });
}

interface FxPressurePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

function parallelPathPressureAt(
  pressures: readonly number[],
  index: number,
): number {
  return clamp(finiteNumber(pressures[index], 0), 0, 1);
}

function fixedPathPressureAt(
  pressures: readonly number[] | null | undefined,
  progress: number,
): number {
  if (!pressures || pressures.length === 0) return FX_PRESSURE_LEGACY_NEUTRAL;
  if (pressures.length === 1) {
    return clamp(finiteNumber(pressures[0], 0), 0, 1);
  }
  const position = clamp(progress, 0, 1) * (pressures.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(pressures.length - 1, Math.ceil(position));
  const amount = position - lowerIndex;
  const lower = clamp(
    finiteNumber(pressures[lowerIndex], 0),
    0,
    1,
  );
  const upper = clamp(finiteNumber(pressures[upperIndex], lower), 0, 1);
  return lower + (upper - lower) * amount;
}

function sanitizeFxPressurePathPoints(
  points: readonly number[],
  pressures: readonly number[] | null | undefined,
): FxPressurePoint[] {
  const pairCount = Math.min(1_000_000, Math.floor(points.length / 2));
  const parallel = pressures && pressures.length === pairCount ? pressures : null;
  const result: FxPressurePoint[] = [];
  for (let pointIndex = 0; pointIndex < pairCount; pointIndex += 1) {
    const x = safeCoord(points[pointIndex * 2]);
    const y = safeCoord(points[pointIndex * 2 + 1]);
    if (x === null || y === null) break;
    const pressure = parallel
      ? parallelPathPressureAt(parallel, pointIndex)
      : fixedPathPressureAt(
          pressures,
          pairCount <= 1 ? 0 : pointIndex / (pairCount - 1),
        );
    const previous = result.at(-1);
    if (previous && Math.hypot(x - previous.x, y - previous.y) <= POINT_EPS) {
      result[result.length - 1] = { x, y, pressure };
    } else {
      result.push({ x, y, pressure });
    }
  }
  return result;
}

interface FxCardinalControl {
  readonly beforeX: number;
  readonly beforeY: number;
  readonly afterX: number;
  readonly afterY: number;
}

function cardinalFxControlAt(
  points: readonly FxPressurePoint[],
  index: number,
  tension: number,
): FxCardinalControl | null {
  if (index < 1 || index >= points.length - 1) return null;
  const previous = points[index - 1]!;
  const current = points[index]!;
  const next = points[index + 1]!;
  const previousDistance = Math.hypot(
    current.x - previous.x,
    current.y - previous.y,
  );
  const nextDistance = Math.hypot(next.x - current.x, next.y - current.y);
  const totalDistance = previousDistance + nextDistance;
  if (totalDistance <= POINT_EPS) return null;
  const beforeFactor = tension * previousDistance / totalDistance;
  const afterFactor = tension * nextDistance / totalDistance;
  return {
    beforeX: current.x - beforeFactor * (next.x - previous.x),
    beforeY: current.y - beforeFactor * (next.y - previous.y),
    afterX: current.x + afterFactor * (next.x - previous.x),
    afterY: current.y + afterFactor * (next.y - previous.y),
  };
}

function cardinalFxControls(
  points: readonly FxPressurePoint[],
  tension: number,
): Array<FxCardinalControl | null> {
  return Array.from(
    { length: points.length },
    (_ignored, index) => cardinalFxControlAt(points, index, tension),
  );
}

function emitFxPressurePathSegment(
  points: readonly FxPressurePoint[],
  controlAt: (index: number) => FxCardinalControl | null,
  sourceSegmentIndex: number,
  sourcePointCount: number,
  resolvePressure: (start: FxPressurePoint, end: FxPressurePoint) => StudioFxBrushPressureResponse,
): StudioFxPressurePathSegment {
  const start = points[sourceSegmentIndex]!;
  const end = points[sourceSegmentIndex + 1]!;
  const pressure = resolvePressure(start, end);
  const startControl = controlAt(sourceSegmentIndex);
  const endControl = controlAt(sourceSegmentIndex + 1);
  if (sourceSegmentIndex === 0 && endControl) {
    return Object.freeze({
      command: "quadratic",
      moveX: start.x,
      moveY: start.y,
      controlX: endControl.beforeX,
      controlY: endControl.beforeY,
      endX: end.x,
      endY: end.y,
      sourceSegmentIndex,
      ...pressure,
    });
  }
  if (sourceSegmentIndex === sourcePointCount - 2 && startControl) {
    return Object.freeze({
      command: "quadratic",
      moveX: start.x,
      moveY: start.y,
      controlX: startControl.afterX,
      controlY: startControl.afterY,
      endX: end.x,
      endY: end.y,
      sourceSegmentIndex,
      ...pressure,
    });
  }
  if (startControl && endControl) {
    return Object.freeze({
      command: "cubic",
      moveX: start.x,
      moveY: start.y,
      control1X: startControl.afterX,
      control1Y: startControl.afterY,
      control2X: endControl.beforeX,
      control2Y: endControl.beforeY,
      endX: end.x,
      endY: end.y,
      sourceSegmentIndex,
      ...pressure,
    });
  }
  return Object.freeze({
    command: "line",
    moveX: start.x,
    moveY: start.y,
    endX: end.x,
    endY: end.y,
    sourceSegmentIndex,
    ...pressure,
  });
}

/**
 * Pressure-bearing port of the Konva cardinal path used by the fixed-path FX brushes.
 */
export function planStudioFxBrushPressurePath(input: {
  readonly brushId: StudioFxPressureBrushId;
  readonly points: readonly number[];
  readonly pressures?: readonly number[] | null;
  readonly pressureModel?: StudioMaterialPressureModel;
  readonly minimumDiameterRatio?: unknown;
  readonly tension?: unknown;
}): StudioFxPressurePathPlan {
  const points = sanitizeFxPressurePathPoints(input.points, input.pressures);
  const canonicalPressure =
    input.pressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1;
  const sourcePointCount = points.length;
  if (sourcePointCount < 2) {
    return Object.freeze({
      kind: "studio-fx-pressure-path",
      brushId: input.brushId,
      sourcePointCount,
      segments: Object.freeze([]),
    });
  }
  const tension = clamp(finiteNumber(input.tension, 0), 0, 1);
  const controls = tension > 0 && sourcePointCount >= 3
    ? cardinalFxControls(points, tension)
    : [];
  const resolvePressure = (
    start: FxPressurePoint,
    end: FxPressurePoint,
  ): StudioFxBrushPressureResponse => (
    canonicalPressure
      ? resolveStudioFxBrushPressureResponse(
          input.brushId,
          (start.pressure + end.pressure) / 2,
          input.minimumDiameterRatio,
        )
      : neutralStudioFxBrushPressureResponse()
  );
  const segments: StudioFxPressurePathSegment[] = [];
  for (
    let sourceSegmentIndex = 0;
    sourceSegmentIndex < sourcePointCount - 1;
    sourceSegmentIndex += 1
  ) {
    segments.push(emitFxPressurePathSegment(
      points,
      (index) => controls[index] ?? null,
      sourceSegmentIndex,
      sourcePointCount,
      resolvePressure,
    ));
  }
  return Object.freeze({
    kind: "studio-fx-pressure-path",
    brushId: input.brushId,
    sourcePointCount,
    segments: Object.freeze(segments),
  });
}

/** 라이브/리렌더용 증분 압력 경로 빌더. */
export function createStudioIncrementalFxPressurePathBuilder(): StudioIncrementalFxPressurePathBuilder {
  const sanitized: FxPressurePoint[] = [];
  const segments: StudioFxPressurePathSegment[] = [];
  let consumedRawPairs = 0;
  let lastRawX = 0;
  let lastRawY = 0;
  let lastRawPressureSlot: number | undefined;
  let configBrushId: StudioFxPressureBrushId | null = null;
  let configTension = 0;
  let configCanonical = false;
  let configMinimumDiameterRatio: unknown;
  let configParallelPressures = false;
  let stableSegments = 0;
  let rebuildGeneration = 0;

  const reset = (): void => {
    sanitized.length = 0;
    segments.length = 0;
    consumedRawPairs = 0;
    lastRawPressureSlot = undefined;
    stableSegments = 0;
    rebuildGeneration += 1;
  };

  return {
    append(input) {
      const pairCount = Math.min(1_000_000, Math.floor(input.points.length / 2));
      const tension = clamp(finiteNumber(input.tension, 0), 0, 1);
      const canonicalPressure =
        input.pressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1;
      const pressures = input.pressures;
      const pressuresAbsent = !pressures || pressures.length === 0;
      const pressuresParallel = !pressuresAbsent && pressures.length === pairCount;
      if (!pressuresAbsent && !pressuresParallel) {
        reset();
        configBrushId = null;
        return planStudioFxBrushPressurePath(input);
      }
      const configMatches = configBrushId === input.brushId
        && configTension === tension
        && configCanonical === canonicalPressure
        && Object.is(configMinimumDiameterRatio, input.minimumDiameterRatio)
        && configParallelPressures === pressuresParallel;
      let prefixVerified = configMatches && pairCount >= consumedRawPairs;
      if (prefixVerified && consumedRawPairs > 0) {
        const lastIndex = consumedRawPairs - 1;
        prefixVerified = input.points[lastIndex * 2] === lastRawX
          && input.points[lastIndex * 2 + 1] === lastRawY
          && (!pressuresParallel || pressures![lastIndex] === lastRawPressureSlot);
      }
      if (!prefixVerified) reset();
      configBrushId = input.brushId;
      configTension = tension;
      configCanonical = canonicalPressure;
      configMinimumDiameterRatio = input.minimumDiameterRatio;
      configParallelPressures = pressuresParallel;

      const previousSegmentCount = segments.length;
      let sanitizedChangedFrom = sanitized.length;
      for (let pointIndex = consumedRawPairs; pointIndex < pairCount; pointIndex += 1) {
        const x = safeCoord(input.points[pointIndex * 2]);
        const y = safeCoord(input.points[pointIndex * 2 + 1]);
        if (x === null || y === null) break;
        const pressure = pressuresParallel
          ? parallelPathPressureAt(pressures!, pointIndex)
          : fixedPathPressureAt(
              pressures,
              pairCount <= 1 ? 0 : pointIndex / (pairCount - 1),
            );
        const previous = sanitized.at(-1);
        if (previous && Math.hypot(x - previous.x, y - previous.y) <= POINT_EPS) {
          sanitized[sanitized.length - 1] = { x, y, pressure };
          sanitizedChangedFrom = Math.min(sanitizedChangedFrom, sanitized.length - 1);
        } else {
          sanitized.push({ x, y, pressure });
        }
        consumedRawPairs = pointIndex + 1;
        lastRawX = input.points[pointIndex * 2]!;
        lastRawY = input.points[pointIndex * 2 + 1]!;
        lastRawPressureSlot = pressuresParallel ? pressures![pointIndex] : undefined;
      }

      const sourcePointCount = sanitized.length;
      if (sourcePointCount < 2) {
        segments.length = 0;
        stableSegments = 0;
        return {
          kind: "studio-fx-pressure-path",
          brushId: input.brushId,
          sourcePointCount,
          segments,
        };
      }
      const useControls = tension > 0 && sourcePointCount >= 3;
      const controlAt = (index: number): FxCardinalControl | null => (
        useControls ? cardinalFxControlAt(sanitized, index, tension) : null
      );
      const resolvePressure = (
        start: FxPressurePoint,
        end: FxPressurePoint,
      ): StudioFxBrushPressureResponse => (
        canonicalPressure
          ? resolveStudioFxBrushPressureResponse(
              input.brushId,
              (start.pressure + end.pressure) / 2,
              input.minimumDiameterRatio,
            )
          : neutralStudioFxBrushPressureResponse()
      );
      const rebuildFrom = sourcePointCount < 5
        ? 0
        : Math.min(
            Math.max(0, previousSegmentCount - FX_PRESSURE_PATH_VOLATILE_TAIL_SEGMENTS),
            Math.max(0, sanitizedChangedFrom - 2),
          );
      segments.length = rebuildFrom;
      for (
        let sourceSegmentIndex = rebuildFrom;
        sourceSegmentIndex < sourcePointCount - 1;
        sourceSegmentIndex += 1
      ) {
        segments.push(emitFxPressurePathSegment(
          sanitized,
          controlAt,
          sourceSegmentIndex,
          sourcePointCount,
          resolvePressure,
        ));
      }
      stableSegments = sourcePointCount < 5
        ? 0
        : Math.max(0, segments.length - FX_PRESSURE_PATH_VOLATILE_TAIL_SEGMENTS);
      return {
        kind: "studio-fx-pressure-path",
        brushId: input.brushId,
        sourcePointCount,
        segments,
      };
    },
    stableSegmentCount() {
      return stableSegments;
    },
    generation() {
      return rebuildGeneration;
    },
  };
}
