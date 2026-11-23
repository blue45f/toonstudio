/**
 * Luminous ribbon pass geometry planner and path tracer for neon, glow, and soft-glow brushes.
 */

import {
  resolveStudioFxPressurePassResponse,
  type StudioFxPressurePathPlan,
  type StudioFxPressurePathSegment,
} from "./studio-fx-brush-pressure-path";
import {
  POINT_EPS,
  TAU,
  clamp,
  finiteNumber,
} from "./studio-fx-brush-sampling";

export type StudioFxLuminousBrushId = "neon" | "glow" | "soft-glow";

/**
 * Luminous colour is accumulated with premultiplied source-over rather than raw additive RGB.
 */
export const STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION = "source-over" as const;

export type StudioFxLuminousRibbonRole =
  | "body"
  | "join"
  | "start-cap"
  | "end-cap";

export interface StudioFxLuminousRibbonPolygon {
  /**
   * Clockwise/counter-clockwise is normalised across every polygon. A non-zero compound fill
   * therefore behaves as a geometric union even when the centreline retraces or crosses itself.
   */
  readonly points: readonly number[];
  readonly role: StudioFxLuminousRibbonRole;
}

export interface StudioFxLuminousRibbonPassPlan {
  readonly kind: "studio-fx-luminous-ribbon-pass";
  readonly version: "studio-fx-luminous-ribbon-v1";
  readonly brushId: StudioFxLuminousBrushId;
  readonly coverageOperation: "stroke-local-single-fill";
  readonly compositeOperation: typeof STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION;
  readonly fillRule: "nonzero";
  readonly cap: "round";
  readonly sourceSegmentCount: number;
  readonly flattenedSegmentCount: number;
  readonly capped: boolean;
  readonly passWidthScale: number;
  readonly luminousCore: boolean;
  /** Complete pass alpha, including the pressure response. */
  readonly opacity: number;
  readonly polygons: readonly StudioFxLuminousRibbonPolygon[];
}

export interface StudioFxLuminousRibbonPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

interface FxLuminousPoint {
  readonly x: number;
  readonly y: number;
}

interface FxLuminousSection {
  readonly from: FxLuminousPoint;
  readonly to: FxLuminousPoint;
  readonly fromRadius: number;
  readonly toRadius: number;
  readonly opacityScale: number;
}

export interface FxLuminousSegmentResponse {
  readonly widthScale: number;
  readonly opacityScale: number;
}

export interface FxLuminousPlanState {
  readonly sections: FxLuminousSection[];
  readonly polygons: StudioFxLuminousRibbonPolygon[];
  openRunStart: number;
  bodyJoinCount: number;
  capped: boolean;
  weightedOpacity: number;
  totalLength: number;
}

export interface FxLuminousPassConfig {
  readonly baseWidth: number;
  readonly passWidthScale: number;
  readonly passOpacity: number;
  readonly luminousCore: boolean;
}

const FX_LUMINOUS_RIBBON_VERSION =
  "studio-fx-luminous-ribbon-v1" as const;
const FX_LUMINOUS_MAX_FLATTENED_SEGMENTS = 262_144;
const FX_LUMINOUS_MAX_SUBDIVISIONS = 16;
const FX_LUMINOUS_ROUND_STEPS = 24;
const FX_LUMINOUS_QUANTIZE_SCALE = 10_000;

function quantizeFxLuminous(value: number): number {
  const result = Math.round(value * FX_LUMINOUS_QUANTIZE_SCALE)
    / FX_LUMINOUS_QUANTIZE_SCALE;
  return Object.is(result, -0) ? 0 : result;
}

function fxLuminousPointAt(
  segment: StudioFxPressurePathSegment,
  progress: number,
): FxLuminousPoint {
  const amount = clamp(progress, 0, 1);
  const inverse = 1 - amount;
  if (segment.command === "cubic") {
    return {
      x: inverse ** 3 * segment.moveX
        + 3 * inverse * inverse * amount * segment.control1X
        + 3 * inverse * amount * amount * segment.control2X
        + amount ** 3 * segment.endX,
      y: inverse ** 3 * segment.moveY
        + 3 * inverse * inverse * amount * segment.control1Y
        + 3 * inverse * amount * amount * segment.control2Y
        + amount ** 3 * segment.endY,
    };
  }
  if (segment.command === "quadratic") {
    return {
      x: inverse * inverse * segment.moveX
        + 2 * inverse * amount * segment.controlX
        + amount * amount * segment.endX,
      y: inverse * inverse * segment.moveY
        + 2 * inverse * amount * segment.controlY
        + amount * amount * segment.endY,
    };
  }
  return {
    x: segment.moveX + (segment.endX - segment.moveX) * amount,
    y: segment.moveY + (segment.endY - segment.moveY) * amount,
  };
}

function fxLuminousPointLineDistance(
  point: FxLuminousPoint,
  start: FxLuminousPoint,
  end: FxLuminousPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= POINT_EPS) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  return Math.abs(
    dy * point.x
    - dx * point.y
    + end.x * start.y
    - end.y * start.x,
  ) / length;
}

function fxLuminousSubdivisionCount(
  segment: StudioFxPressurePathSegment,
  passWidth: number,
): number {
  if (segment.command === "line") return 1;
  const start = { x: segment.moveX, y: segment.moveY };
  const end = { x: segment.endX, y: segment.endY };
  const flatness = segment.command === "cubic"
    ? Math.max(
        fxLuminousPointLineDistance(
          { x: segment.control1X, y: segment.control1Y },
          start,
          end,
        ),
        fxLuminousPointLineDistance(
          { x: segment.control2X, y: segment.control2Y },
          start,
          end,
        ),
      )
    : fxLuminousPointLineDistance(
        { x: segment.controlX, y: segment.controlY },
        start,
        end,
      );
  const tolerance = clamp(passWidth * 0.025, 0.1, 0.55);
  if (!Number.isFinite(flatness) || flatness <= tolerance) return 1;
  return clamp(
    2 ** Math.ceil(Math.log2(Math.sqrt(flatness / tolerance))),
    1,
    FX_LUMINOUS_MAX_SUBDIVISIONS,
  );
}

function fxLuminousSamePoint(
  left: FxLuminousPoint,
  right: FxLuminousPoint,
): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= POINT_EPS;
}

function fxLuminousSegmentResponses(
  pressurePath: StudioFxPressurePathPlan,
  passWidthScale: number,
  luminousCore: boolean,
): readonly FxLuminousSegmentResponse[] {
  return Object.freeze(pressurePath.segments.map((segment) => (
    resolveStudioFxPressurePassResponse(
      segment,
      passWidthScale,
      luminousCore,
    )
  )));
}

function fxLuminousInterpolatedScale(
  responses: readonly FxLuminousSegmentResponse[],
  segments: readonly StudioFxPressurePathSegment[],
  segmentIndex: number,
  edge: "from " | "to",
  key: keyof FxLuminousSegmentResponse,
): number {
  const current = responses[segmentIndex]![key];
  const adjacentIndex = edge === "from " ? segmentIndex - 1 : segmentIndex + 1;
  const adjacent = responses[adjacentIndex];
  const adjacentSegment = segments[adjacentIndex];
  const segment = segments[segmentIndex]!;
  if (!adjacent || !adjacentSegment) return current;
  const continuous = edge === "from "
    ? fxLuminousSamePoint(
        { x: adjacentSegment.endX, y: adjacentSegment.endY },
        { x: segment.moveX, y: segment.moveY },
      )
    : fxLuminousSamePoint(
        { x: segment.endX, y: segment.endY },
        { x: adjacentSegment.moveX, y: adjacentSegment.moveY },
      );
  return continuous ? (current + adjacent[key]) / 2 : current;
}

export function createFxLuminousPlanState(): FxLuminousPlanState {
  return {
    sections: [],
    polygons: [],
    openRunStart: 0,
    bodyJoinCount: 0,
    capped: false,
    weightedOpacity: 0,
    totalLength: 0,
  };
}

export function appendFxLuminousSections(
  state: FxLuminousPlanState,
  pressurePath: StudioFxPressurePathPlan,
  passWidth: number,
  responses: readonly FxLuminousSegmentResponse[],
  fromSegmentIndex: number,
  toSegmentIndex: number,
): void {
  const sections = state.sections;
  const segments = pressurePath.segments;
  for (
    let segmentIndex = fromSegmentIndex;
    segmentIndex < toSegmentIndex;
    segmentIndex += 1
  ) {
    const segment = segments[segmentIndex]!;
    const subdivisions = fxLuminousSubdivisionCount(segment, passWidth);
    const fromWidthScale = fxLuminousInterpolatedScale(
      responses,
      segments,
      segmentIndex,
      "from ",
      "widthScale",
    );
    const toWidthScale = fxLuminousInterpolatedScale(
      responses,
      segments,
      segmentIndex,
      "to",
      "widthScale",
    );
    const fromOpacityScale = fxLuminousInterpolatedScale(
      responses,
      segments,
      segmentIndex,
      "from ",
      "opacityScale",
    );
    const toOpacityScale = fxLuminousInterpolatedScale(
      responses,
      segments,
      segmentIndex,
      "to",
      "opacityScale",
    );
    for (let subdivision = 0; subdivision < subdivisions; subdivision += 1) {
      if (sections.length >= FX_LUMINOUS_MAX_FLATTENED_SEGMENTS) {
        state.capped = true;
        return;
      }
      const fromProgress = subdivision / subdivisions;
      const toProgress = (subdivision + 1) / subdivisions;
      const from = fxLuminousPointAt(segment, fromProgress);
      const to = fxLuminousPointAt(segment, toProgress);
      if (fxLuminousSamePoint(from, to)) continue;
      const fromResponseWidth = fromWidthScale
        + (toWidthScale - fromWidthScale) * fromProgress;
      const toResponseWidth = fromWidthScale
        + (toWidthScale - fromWidthScale) * toProgress;
      const midpointProgress = (fromProgress + toProgress) / 2;
      const opacityScale = clamp(
        fromOpacityScale
        + (toOpacityScale - fromOpacityScale) * midpointProgress,
        0,
        4,
      );
      sections.push(Object.freeze({
        from,
        to,
        fromRadius: clamp(
          passWidth * fromResponseWidth / 2,
          0.25,
          2048,
        ),
        toRadius: clamp(
          passWidth * toResponseWidth / 2,
          0.25,
          2048,
        ),
        opacityScale,
      }));
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      state.weightedOpacity += opacityScale * length;
      state.totalLength += length;
    }
  }
}

function fxLuminousPolygonSignedArea(points: readonly number[]): number {
  let area = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const nextIndex = (index + 2) % points.length;
    area += points[index]! * points[nextIndex + 1]!
      - points[nextIndex]! * points[index + 1]!;
  }
  return area / 2;
}

function sameWindingFxLuminousPolygon(
  points: readonly number[],
): readonly number[] {
  if (fxLuminousPolygonSignedArea(points) >= 0) {
    return Object.freeze([...points]);
  }
  const reversed: number[] = [];
  for (let index = points.length - 2; index >= 0; index -= 2) {
    reversed.push(points[index]!, points[index + 1]!);
  }
  return Object.freeze(reversed);
}

function fxLuminousBodyPolygon(
  section: FxLuminousSection,
): readonly number[] {
  const dx = section.to.x - section.from.x;
  const dy = section.to.y - section.from.y;
  const length = Math.hypot(dx, dy);
  const normalX = -dy / length;
  const normalY = dx / length;
  return sameWindingFxLuminousPolygon([
    quantizeFxLuminous(section.from.x + normalX * section.fromRadius),
    quantizeFxLuminous(section.from.y + normalY * section.fromRadius),
    quantizeFxLuminous(section.to.x + normalX * section.toRadius),
    quantizeFxLuminous(section.to.y + normalY * section.toRadius),
    quantizeFxLuminous(section.to.x - normalX * section.toRadius),
    quantizeFxLuminous(section.to.y - normalY * section.toRadius),
    quantizeFxLuminous(section.from.x - normalX * section.fromRadius),
    quantizeFxLuminous(section.from.y - normalY * section.fromRadius),
  ]);
}

function fxLuminousRoundPolygon(
  center: FxLuminousPoint,
  radius: number,
): readonly number[] {
  const points: number[] = [];
  for (let step = 0; step < FX_LUMINOUS_ROUND_STEPS; step += 1) {
    const angle = TAU * step / FX_LUMINOUS_ROUND_STEPS;
    points.push(
      quantizeFxLuminous(center.x + Math.cos(angle) * radius),
      quantizeFxLuminous(center.y + Math.sin(angle) * radius),
    );
  }
  return sameWindingFxLuminousPolygon(points);
}

function pushFxLuminousRunCaps(
  polygons: StudioFxLuminousRibbonPolygon[],
  first: FxLuminousSection,
  last: FxLuminousSection,
): void {
  polygons.push(
    Object.freeze({
      points: fxLuminousRoundPolygon(first.from, first.fromRadius),
      role: "start-cap" as const,
    }),
    Object.freeze({
      points: fxLuminousRoundPolygon(last.to, last.toRadius),
      role: "end-cap" as const,
    }),
  );
}

export function appendFxLuminousRunPolygons(
  state: FxLuminousPlanState,
  fromSectionIndex: number,
): void {
  const { polygons, sections } = state;
  polygons.length = state.bodyJoinCount;
  for (let index = fromSectionIndex; index < sections.length; index += 1) {
    const section = sections[index]!;
    const previous = index > 0 ? sections[index - 1]! : null;
    if (previous && !fxLuminousSamePoint(previous.to, section.from)) {
      pushFxLuminousRunCaps(polygons, sections[state.openRunStart]!, previous);
      state.openRunStart = index;
    }
    polygons.push(Object.freeze({
      points: fxLuminousBodyPolygon(section),
      role: "body" as const,
    }));
    if (previous && index > state.openRunStart) {
      polygons.push(Object.freeze({
        points: fxLuminousRoundPolygon(
          previous.to,
          Math.max(previous.toRadius, section.fromRadius),
        ),
        role: "join" as const,
      }));
    }
    state.bodyJoinCount = polygons.length;
  }
  const last = sections.at(-1);
  if (last) pushFxLuminousRunCaps(polygons, sections[state.openRunStart]!, last);
}

function fxLuminousPlanWeightedOpacity(state: FxLuminousPlanState): number {
  return state.totalLength <= POINT_EPS
    ? 1
    : state.weightedOpacity / state.totalLength;
}

export function resolveFxLuminousPassConfig(input: {
  readonly baseWidth: unknown;
  readonly passWidthScale: unknown;
  readonly passOpacity: unknown;
  readonly luminousCore?: boolean;
}): FxLuminousPassConfig {
  return {
    baseWidth: clamp(finiteNumber(input.baseWidth, 0), 0, 4096),
    passWidthScale: clamp(finiteNumber(input.passWidthScale, 1), 0.025, 16),
    passOpacity: clamp(finiteNumber(input.passOpacity, 0), 0, 1),
    luminousCore: input.luminousCore === true,
  };
}

export function sealFxLuminousRibbonPassPlan(
  brushId: StudioFxLuminousBrushId,
  pressurePath: StudioFxPressurePathPlan,
  config: FxLuminousPassConfig,
  state: FxLuminousPlanState,
  polygons: readonly StudioFxLuminousRibbonPolygon[],
): StudioFxLuminousRibbonPassPlan {
  return {
    kind: "studio-fx-luminous-ribbon-pass",
    version: FX_LUMINOUS_RIBBON_VERSION,
    brushId,
    coverageOperation: "stroke-local-single-fill",
    compositeOperation: STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION,
    fillRule: "nonzero",
    cap: "round",
    sourceSegmentCount: pressurePath.segments.length,
    flattenedSegmentCount: state.sections.length,
    capped: state.capped,
    passWidthScale: config.passWidthScale,
    luminousCore: config.luminousCore,
    opacity: clamp(
      config.passOpacity * fxLuminousPlanWeightedOpacity(state),
      0,
      1,
    ),
    polygons,
  };
}

/**
 * Plans one luminous pass as a stroke-local coverage mask.
 */
export function planStudioFxLuminousRibbonPass(input: {
  readonly brushId: StudioFxLuminousBrushId;
  readonly pressurePath: StudioFxPressurePathPlan;
  readonly baseWidth: unknown;
  readonly passWidthScale: unknown;
  readonly passOpacity: unknown;
  readonly luminousCore?: boolean;
}): StudioFxLuminousRibbonPassPlan {
  const config = resolveFxLuminousPassConfig(input);
  const state = createFxLuminousPlanState();
  if (config.baseWidth > 0) {
    appendFxLuminousSections(
      state,
      input.pressurePath,
      clamp(config.baseWidth * config.passWidthScale, 0.5, 4096),
      fxLuminousSegmentResponses(
        input.pressurePath,
        config.passWidthScale,
        config.luminousCore,
      ),
      0,
      input.pressurePath.segments.length,
    );
    appendFxLuminousRunPolygons(state, 0);
  }
  return Object.freeze(sealFxLuminousRibbonPassPlan(
    input.brushId,
    input.pressurePath,
    config,
    state,
    Object.freeze(state.polygons),
  ));
}

/**
 * Appends a luminous pass to the caller's current path.
 */
export function traceStudioFxLuminousRibbonPass(
  sink: StudioFxLuminousRibbonPathSink,
  plan: StudioFxLuminousRibbonPassPlan,
): void {
  traceStudioFxLuminousRibbonPassRange(sink, plan, 0, plan.polygons.length);
}

/**
 * Appends polygons `[fromPolygonIndex, toPolygonIndex)` of a luminous pass.
 */
export function traceStudioFxLuminousRibbonPassRange(
  sink: StudioFxLuminousRibbonPathSink,
  plan: StudioFxLuminousRibbonPassPlan,
  fromPolygonIndex: number,
  toPolygonIndex: number,
): void {
  const polygons = plan.polygons;
  const from = Math.max(0, Math.min(fromPolygonIndex, polygons.length));
  const to = Math.max(from, Math.min(toPolygonIndex, polygons.length));
  for (let index = from; index < to; index += 1) {
    const points = polygons[index]!.points;
    if (points.length < 6) continue;
    sink.moveTo(points[0]!, points[1]!);
    for (let offset = 2; offset + 1 < points.length; offset += 2) {
      sink.lineTo(points[offset]!, points[offset + 1]!);
    }
    sink.closePath();
  }
}
