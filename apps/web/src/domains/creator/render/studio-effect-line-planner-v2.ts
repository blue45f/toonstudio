/**
 * CSP 집중선(vars 509–517) 및 속도선(vars 501–507) 스트림 플래너 v2.
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * 클린룸 수학 구현 원칙:
 * - 비결정적 난수 호출 없이 시드 고정 Mulberry32 PRNG만 사용하여 동일 입력에서 항상 동일한 폴리곤을 생성한다.
 * - 테이퍼 사각형/리본 폴리곤(taperIn, taperOut), 묶음 배열(groupSize, groupGap, groupDisturb),
 *   길이·두께·각도·시작 간격 지터, 타원·곡선 기준선 방출기, 2차 베지어 궤적 휨(curveAmount),
 *   내부 채움(innerFill), 8종 표준 프리셋을 순수 지오메트리로 계획한다.
 */

import type { FocusLinesEl, SpeedLinesEl } from "../studio-element-model";

export interface EffectPoint2D {
  readonly x: number;
  readonly y: number;
}

export type StudioEffectLineKind = "focus" | "speed";
export type StudioEffectEmitterKind = "ellipse" | "curve";
export type StudioFocusPresetId = "scattered-focus" | "dense-focus" | "dark-curved-focus" | "burst";
export type StudioSpeedPresetId = "scattered-speed" | "dark-speed" | "gloom" | "rain";
export type StudioEffectLinePresetId = StudioFocusPresetId | StudioSpeedPresetId;

/** 개별 효과선 한 줄의 닫힌 테이퍼 다각형(사각형 또는 곡선 리본). */
export interface StudioTaperedEffectPolygon {
  readonly index: number;
  readonly bundleIndex: number;
  readonly centerline: readonly EffectPoint2D[];
  readonly vertices: readonly EffectPoint2D[];
  readonly points: readonly number[];
  readonly pathData: string;
  readonly baseWidthPx: number;
  readonly startWidthPx: number;
  readonly endWidthPx: number;
}

/** 내부 공백 또는 외곽 배경을 채우는 다각형 기술자. */
export interface StudioEffectInnerFillPolygon {
  readonly vertices: readonly EffectPoint2D[];
  readonly points: readonly number[];
  readonly pathData: string;
  readonly fillColor: string;
  readonly fillOpacity: number;
}

/** 공통 Stream* 파라미터 규격(테이퍼·다발·지터·2차 베지어 곡률). */
export interface StudioEffectStreamCommonParams {
  readonly seed: string | number;
  readonly width: number;
  readonly height: number;
  readonly lineCount: number;
  readonly baseWidthPx: number;
  readonly taperIn: number;
  readonly taperOut: number;
  readonly groupSize: number;
  readonly groupGap: number;
  readonly groupDisturb: number;
  readonly lengthJitter: number;
  readonly widthJitter: number;
  readonly angleJitterDeg: number;
  readonly startGapJitter: number;
  readonly curveAmount: number;
  readonly curveSteps: number;
  readonly strokeColor: string;
}

/** CSP 집중선(vars 509–517) 입력 파라미터. */
export interface StudioFocusLinesV2Input extends Partial<StudioEffectStreamCommonParams> {
  readonly centerXRatio?: number;
  readonly centerYRatio?: number;
  readonly innerRadiusX?: number;
  readonly innerRadiusY?: number;
  readonly outerRadius?: number;
  readonly ellipseRotationDeg?: number;
  readonly emitterKind?: StudioEffectEmitterKind;
  readonly referenceCurve?: readonly EffectPoint2D[];
  readonly innerFillEnabled?: boolean;
  readonly innerFillColor?: string;
  readonly innerFillOpacity?: number;
}

/** CSP 속도선(vars 501–507) 입력 파라미터. */
export interface StudioSpeedLinesV2Input extends Partial<StudioEffectStreamCommonParams> {
  readonly angleDeg?: number;
  readonly direction?: "horizontal" | "vertical";
  readonly emitterKind?: StudioEffectEmitterKind;
  readonly emitterRadiusX?: number;
  readonly emitterRadiusY?: number;
  readonly referenceCurve?: readonly EffectPoint2D[];
  readonly scatterAcrossCanvas?: boolean;
  readonly minLengthRatio?: number;
  readonly maxLengthRatio?: number;
  readonly innerFillEnabled?: boolean;
  readonly innerFillColor?: string;
  readonly innerFillOpacity?: number;
}

export interface StudioEffectLinePlanV2 {
  readonly kind: StudioEffectLineKind;
  readonly presetId?: StudioEffectLinePresetId;
  readonly seedHash: number;
  readonly strokeColor: string;
  readonly polygons: readonly StudioTaperedEffectPolygon[];
  readonly innerFill: StudioEffectInnerFillPolygon | null;
  readonly bounds: { readonly width: number; readonly height: number };
}

export interface StudioEffectLinePresetSpec {
  readonly id: StudioEffectLinePresetId;
  readonly kind: StudioEffectLineKind;
  readonly label: string;
  readonly description: string;
  readonly focusParams?: StudioFocusLinesV2Input;
  readonly speedParams?: StudioSpeedLinesV2Input;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** FNV-1a 32비트 해시 — 문자열·숫자 시드를 결정적 부호 없는 32비트 정수로 변환한다. */
export function hashEffectSeed(seed: string | number): number {
  const text = typeof seed === "number" ? `n:${seed}` : `s:${seed}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 0x9e3779b9;
}

/** Mulberry32 결정적 의사난수 생성기 — [0, 1) 부동소수점을 반환한다. */
export function createEffectPrng(seed: string | number): () => number {
  let state = hashEffectSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function verticesToFlatPoints(vertices: readonly EffectPoint2D[]): number[] {
  const flat: number[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const pt = vertices[i]!;
    flat.push(round2(pt.x), round2(pt.y));
  }
  return flat;
}

function verticesToSvgPath(vertices: readonly EffectPoint2D[]): string {
  if (vertices.length === 0) return "";
  const parts: string[] = [`M ${round2(vertices[0]!.x)} ${round2(vertices[0]!.y)}`];
  for (let i = 1; i < vertices.length; i += 1) {
    parts.push(`L ${round2(vertices[i]!.x)} ${round2(vertices[i]!.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** 진행 비율 t(0..1)에서의 테이퍼 선 폭을 계산한다. */
function evaluateTaperWidth(baseWidth: number, taperIn: number, taperOut: number, t: number): number {
  const safeBase = Math.max(0.2, baseWidth);
  const ti = clamp(taperIn, 0, 1);
  const to = clamp(taperOut, 0, 1);
  if (ti <= 1e-6 && to <= 1e-6) return safeBase;
  if (ti > 1e-6 && to <= 1e-6) return safeBase * (1 - ti + ti * t);
  if (ti <= 1e-6 && to > 1e-6) return safeBase * (1 - to * t);
  return t <= 0.5 ? safeBase * (1 - ti + ti * (t * 2)) : safeBase * (1 - to * ((t - 0.5) * 2));
}

/**
 * 시작점 P0, 끝점 P1, 곡률 curveAmount, 테이퍼 비율로 닫힌 테이퍼 폴리곤을 생성한다.
 * 직선 + 한쪽 테이퍼일 때는 정확히 4정점 사각형(바늘 끝 삼각 수렴 포함)을 배출한다.
 */
export function buildTaperedTrajectoryPolygon(params: {
  readonly index: number;
  readonly bundleIndex: number;
  readonly start: EffectPoint2D;
  readonly end: EffectPoint2D;
  readonly baseWidthPx: number;
  readonly taperIn: number;
  readonly taperOut: number;
  readonly curveAmount: number;
  readonly curveSteps: number;
}): StudioTaperedEffectPolygon {
  const { start, end, baseWidthPx, taperIn, taperOut, curveAmount } = params;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen < 1e-4) {
    const half = Math.max(0.25, baseWidthPx * 0.5);
    const fallback: EffectPoint2D[] = [
      { x: start.x - half, y: start.y - half },
      { x: start.x + half, y: start.y - half },
      { x: start.x + half, y: start.y + half },
      { x: start.x - half, y: start.y + half },
    ];
    return {
      index: params.index,
      bundleIndex: params.bundleIndex,
      centerline: [start, end],
      vertices: fallback,
      points: verticesToFlatPoints(fallback),
      pathData: verticesToSvgPath(fallback),
      baseWidthPx,
      startWidthPx: baseWidthPx,
      endWidthPx: baseWidthPx,
    };
  }

  const chordNx = -dy / chordLen;
  const chordNy = dx / chordLen;
  const bendOffset = clamp(curveAmount, -1, 1) * chordLen * 0.32;
  const ctrl: EffectPoint2D = {
    x: (start.x + end.x) * 0.5 + chordNx * bendOffset,
    y: (start.y + end.y) * 0.5 + chordNy * bendOffset,
  };

  const hasCurve = Math.abs(curveAmount) > 1e-4;
  const hasDualTaper = taperIn > 1e-4 && taperOut > 1e-4;
  const steps = hasCurve ? Math.max(4, Math.min(24, Math.round(params.curveSteps))) : hasDualTaper ? 2 : 1;

  const centerline: EffectPoint2D[] = [];
  const leftSide: EffectPoint2D[] = [];
  const rightSide: EffectPoint2D[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const px = hasCurve
      ? mt * mt * start.x + 2 * mt * t * ctrl.x + t * t * end.x
      : start.x + dx * t;
    const py = hasCurve
      ? mt * mt * start.y + 2 * mt * t * ctrl.y + t * t * end.y
      : start.y + dy * t;
    const tx = hasCurve
      ? 2 * mt * (ctrl.x - start.x) + 2 * t * (end.x - ctrl.x)
      : dx;
    const ty = hasCurve
      ? 2 * mt * (ctrl.y - start.y) + 2 * t * (end.y - ctrl.y)
      : dy;
    const tLen = Math.hypot(tx, ty) || 1;
    const nx = -ty / tLen;
    const ny = tx / tLen;
    const halfW = evaluateTaperWidth(baseWidthPx, taperIn, taperOut, t) * 0.5;

    centerline.push({ x: px, y: py });
    leftSide.push({ x: px + nx * halfW, y: py + ny * halfW });
    rightSide.push({ x: px - nx * halfW, y: py - ny * halfW });
  }

  const vertices: EffectPoint2D[] = [...leftSide, ...rightSide.reverse()];
  return {
    index: params.index,
    bundleIndex: params.bundleIndex,
    centerline,
    vertices,
    points: verticesToFlatPoints(vertices),
    pathData: verticesToSvgPath(vertices),
    baseWidthPx,
    startWidthPx: evaluateTaperWidth(baseWidthPx, taperIn, taperOut, 0),
    endWidthPx: evaluateTaperWidth(baseWidthPx, taperIn, taperOut, 1),
  };
}

/** 묶음(groupSize, groupGap, groupDisturb) 규칙을 반영한 정규화 배치 파라미터 [0, 1) 시퀀스를 생성한다. */
function computeBundledParameters(
  count: number,
  groupSize: number,
  groupGap: number,
  groupDisturb: number,
  rand: () => number,
): readonly { readonly param: number; readonly bundleIndex: number }[] {
  const safeCount = Math.max(0, Math.min(800, Math.floor(count)));
  if (safeCount === 0) return [];
  const gSize = Math.max(1, Math.min(16, Math.round(groupSize)));
  const gapRatio = clamp(groupGap, 0, 2);
  const disturb = clamp(groupDisturb, 0, 1);
  const bundleCount = Math.ceil(safeCount / gSize);
  const bundleSpan = 1 / bundleCount;
  const activeFraction = 1 / (1 + gapRatio);
  const usableSpan = bundleSpan * activeFraction;

  const out: { readonly param: number; readonly bundleIndex: number }[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    const bundleIndex = Math.floor(i / gSize);
    const slotInBundle = i % gSize;
    const slotsThisBundle = Math.min(gSize, safeCount - bundleIndex * gSize);
    const baseCenter = (bundleIndex + 0.5) * bundleSpan;
    const regularLocal =
      slotsThisBundle <= 1 ? 0 : (slotInBundle / (slotsThisBundle - 1) - 0.5) * usableSpan;
    const randomLocal = (rand() - 0.5) * usableSpan;
    const localOffset = regularLocal * (1 - disturb) + randomLocal * disturb;
    const bundleJitter = (rand() - 0.5) * bundleSpan * gapRatio * disturb * 0.35;
    const raw = baseCenter + localOffset + bundleJitter;
    const wrapped = ((raw % 1) + 1) % 1;
    out.push({ param: wrapped, bundleIndex });
  }
  return out;
}

/** 기준 곡선(폴리라인) 위의 정규화 호장 위치 u(0..1)와 법선 벡터를 보간한다. */
function samplePolylineWithNormal(
  curve: readonly EffectPoint2D[],
  u: number,
): { readonly point: EffectPoint2D; readonly normal: EffectPoint2D } {
  if (curve.length === 0) return { point: { x: 0, y: 0 }, normal: { x: 0, y: 1 } };
  if (curve.length === 1) return { point: curve[0]!, normal: { x: 0, y: 1 } };
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < curve.length - 1; i += 1) {
    const len = Math.hypot(curve[i + 1]!.x - curve[i]!.x, curve[i + 1]!.y - curve[i]!.y);
    segLengths.push(len);
    total += len;
  }
  if (total <= 1e-6) return { point: curve[0]!, normal: { x: 0, y: 1 } };
  const target = clamp(u, 0, 1) * total;
  let acc = 0;
  for (let i = 0; i < segLengths.length; i += 1) {
    const segLen = segLengths[i]!;
    if (acc + segLen >= target || i === segLengths.length - 1) {
      const localT = segLen > 1e-6 ? clamp((target - acc) / segLen, 0, 1) : 0;
      const p0 = curve[i]!;
      const p1 = curve[i + 1]!;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dLen = Math.hypot(dx, dy) || 1;
      return { point: { x: p0.x + dx * localT, y: p0.y + dy * localT }, normal: { x: -dy / dLen, y: dx / dLen } };
    }
    acc += segLen;
  }
  return { point: curve[curve.length - 1]!, normal: { x: 0, y: 1 } };
}

function buildEllipsePolygon(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotationDeg: number,
  fillColor: string,
  fillOpacity: number,
  segments = 48,
): StudioEffectInnerFillPolygon {
  const rot = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const vertices: EffectPoint2D[] = [];
  const n = Math.max(12, segments);
  for (let i = 0; i < n; i += 1) {
    const theta = (i * 2 * Math.PI) / n;
    const lx = rx * Math.cos(theta);
    const ly = ry * Math.sin(theta);
    vertices.push({ x: cx + lx * cosR - ly * sinR, y: cy + lx * sinR + ly * cosR });
  }
  return { vertices, points: verticesToFlatPoints(vertices), pathData: verticesToSvgPath(vertices), fillColor, fillOpacity: clamp(fillOpacity, 0, 1) };
}

function resolveCommonStreamParams(
  input: Partial<StudioEffectStreamCommonParams>,
  defaults: Omit<StudioEffectStreamCommonParams, "width" | "height" | "strokeColor">,
): StudioEffectStreamCommonParams {
  return {
    seed: input.seed ?? defaults.seed,
    width: Math.max(16, input.width ?? 800),
    height: Math.max(16, input.height ?? 1200),
    lineCount: clamp(Math.round(input.lineCount ?? defaults.lineCount), 4, 600),
    baseWidthPx: clamp(input.baseWidthPx ?? defaults.baseWidthPx, 0.4, 48),
    taperIn: clamp(input.taperIn ?? defaults.taperIn, 0, 1),
    taperOut: clamp(input.taperOut ?? defaults.taperOut, 0, 1),
    groupSize: clamp(Math.round(input.groupSize ?? defaults.groupSize), 1, 16),
    groupGap: clamp(input.groupGap ?? defaults.groupGap, 0, 2),
    groupDisturb: clamp(input.groupDisturb ?? defaults.groupDisturb, 0, 1),
    lengthJitter: clamp(input.lengthJitter ?? defaults.lengthJitter, 0, 1),
    widthJitter: clamp(input.widthJitter ?? defaults.widthJitter, 0, 1),
    angleJitterDeg: clamp(input.angleJitterDeg ?? defaults.angleJitterDeg, 0, 45),
    startGapJitter: clamp(input.startGapJitter ?? defaults.startGapJitter, 0, 1),
    curveAmount: clamp(input.curveAmount ?? defaults.curveAmount, -1, 1),
    curveSteps: clamp(Math.round(input.curveSteps ?? defaults.curveSteps), 2, 24),
    strokeColor: input.strokeColor ?? "#000000",
  };
}

/** CSP 집중선(vars 509–517) 테이퍼 다각형 계획을 수립한다. */
export function planFocusLinesV2(
  input: StudioFocusLinesV2Input,
  presetId?: StudioFocusPresetId,
): StudioEffectLinePlanV2 {
  const c = resolveCommonStreamParams(input, {
    seed: "focus-default",
    lineCount: 96,
    baseWidthPx: 3.5,
    taperIn: 0,
    taperOut: 1,
    groupSize: 1,
    groupGap: 0,
    groupDisturb: 0.25,
    lengthJitter: 0.25,
    widthJitter: 0.2,
    angleJitterDeg: 1.2,
    startGapJitter: 0.2,
    curveAmount: 0,
    curveSteps: 10,
  });
  const rand = createEffectPrng(c.seed);
  const cx = c.width * clamp(input.centerXRatio ?? 0.5, -0.5, 1.5);
  const cy = c.height * clamp(input.centerYRatio ?? 0.5, -0.5, 1.5);
  const rx = Math.max(4, input.innerRadiusX ?? Math.min(c.width, c.height) * 0.18);
  const ry = Math.max(4, input.innerRadiusY ?? rx);
  const outerRadius = Math.max(Math.max(rx, ry) + 20, input.outerRadius ?? Math.hypot(c.width, c.height) * 0.72);
  const ellipseRotRad = ((input.ellipseRotationDeg ?? 0) * Math.PI) / 180;
  const cosE = Math.cos(ellipseRotRad);
  const sinE = Math.sin(ellipseRotRad);
  const useCurveEmitter = input.emitterKind === "curve" && (input.referenceCurve?.length ?? 0) >= 2;
  const bundled = computeBundledParameters(c.lineCount, c.groupSize, c.groupGap, c.groupDisturb, rand);
  const polygons: StudioTaperedEffectPolygon[] = [];

  for (let i = 0; i < bundled.length; i += 1) {
    const { param, bundleIndex } = bundled[i]!;
    const wFactor = Math.max(0.15, 1 + (rand() - 0.5) * 2 * c.widthJitter);
    const lenFactor = Math.max(0.15, 1 + (rand() - 0.5) * 2 * c.lengthJitter);
    const gapDelta = (rand() - 0.5) * 2 * c.startGapJitter;
    const angJitterRad = ((rand() - 0.5) * 2 * c.angleJitterDeg * Math.PI) / 180;

    let startPt: EffectPoint2D;
    let endPt: EffectPoint2D;
    if (useCurveEmitter && input.referenceCurve) {
      const sampled = samplePolylineWithNormal(input.referenceCurve, param);
      const rayAngle = Math.atan2(sampled.point.y - cy, sampled.point.x - cx) + angJitterRad;
      const baseDist = Math.hypot(sampled.point.x - cx, sampled.point.y - cy);
      const innerStop = Math.max(4, baseDist * (1 + gapDelta * 0.35));
      const outerSpan = Math.max(24, (outerRadius - baseDist) * lenFactor);
      startPt = { x: cx + (innerStop + outerSpan) * Math.cos(rayAngle), y: cy + (innerStop + outerSpan) * Math.sin(rayAngle) };
      endPt = { x: cx + innerStop * Math.cos(rayAngle), y: cy + innerStop * Math.sin(rayAngle) };
    } else {
      const theta = param * Math.PI * 2 + angJitterRad;
      const ex = rx * Math.cos(theta);
      const ey = ry * Math.sin(theta);
      const rimX = ex * cosE - ey * sinE;
      const rimY = ex * sinE + ey * cosE;
      const rimRadius = Math.hypot(rimX, rimY);
      const dirX = rimRadius > 1e-6 ? rimX / rimRadius : Math.cos(theta);
      const dirY = rimRadius > 1e-6 ? rimY / rimRadius : Math.sin(theta);
      const innerStop = Math.max(2, rimRadius * (1 + gapDelta * 0.4));
      const outerStart = innerStop + Math.max(16, (outerRadius - rimRadius) * lenFactor);
      startPt = { x: cx + dirX * outerStart, y: cy + dirY * outerStart };
      endPt = { x: cx + dirX * innerStop, y: cy + dirY * innerStop };
    }

    polygons.push(
      buildTaperedTrajectoryPolygon({
        index: i,
        bundleIndex,
        start: startPt,
        end: endPt,
        baseWidthPx: c.baseWidthPx * wFactor,
        taperIn: c.taperIn,
        taperOut: c.taperOut,
        curveAmount: c.curveAmount,
        curveSteps: c.curveSteps,
      }),
    );
  }

  let innerFill: StudioEffectInnerFillPolygon | null = null;
  if (input.innerFillEnabled) {
    innerFill =
      useCurveEmitter && input.referenceCurve && input.referenceCurve.length >= 3
        ? {
            vertices: input.referenceCurve,
            points: verticesToFlatPoints(input.referenceCurve),
            pathData: verticesToSvgPath(input.referenceCurve),
            fillColor: input.innerFillColor ?? "#ffffff",
            fillOpacity: clamp(input.innerFillOpacity ?? 1, 0, 1),
          }
        : buildEllipsePolygon(
            cx,
            cy,
            rx,
            ry,
            input.ellipseRotationDeg ?? 0,
            input.innerFillColor ?? "#ffffff",
            input.innerFillOpacity ?? 1,
          );
  }

  return {
    kind: "focus",
    ...(presetId ? { presetId } : {}),
    seedHash: hashEffectSeed(c.seed),
    strokeColor: c.strokeColor,
    polygons,
    innerFill,
    bounds: { width: c.width, height: c.height },
  };
}

/** CSP 속도선(vars 501–507) 테이퍼 다각형 계획을 수립한다. */
export function planSpeedLinesV2(
  input: StudioSpeedLinesV2Input,
  presetId?: StudioSpeedPresetId,
): StudioEffectLinePlanV2 {
  const c = resolveCommonStreamParams(input, {
    seed: "speed-default",
    lineCount: 64,
    baseWidthPx: 2.8,
    taperIn: 0.2,
    taperOut: 1,
    groupSize: 1,
    groupGap: 0,
    groupDisturb: 0.35,
    lengthJitter: 0.3,
    widthJitter: 0.25,
    angleJitterDeg: 0.6,
    startGapJitter: 0.25,
    curveAmount: 0,
    curveSteps: 8,
  });
  const rand = createEffectPrng(c.seed);
  const resolvedAngleDeg = input.angleDeg !== undefined ? input.angleDeg : input.direction === "vertical" ? 90 : 0;
  const baseAngleRad = (resolvedAngleDeg * Math.PI) / 180;
  const dirX = Math.cos(baseAngleRad);
  const dirY = Math.sin(baseAngleRad);
  const perpX = -dirY;
  const perpY = dirX;

  const diag = Math.hypot(c.width, c.height);
  const alongSpan = Math.abs(dirX) * c.width + Math.abs(dirY) * c.height;
  const crossSpan = Math.abs(perpX) * c.width + Math.abs(perpY) * c.height;
  const minLenRatio = clamp(input.minLengthRatio ?? 0.28, 0.05, 1.2);
  const maxLenRatio = clamp(input.maxLengthRatio ?? 0.92, minLenRatio, 1.5);
  const useCurveEmitter = input.emitterKind === "curve" && (input.referenceCurve?.length ?? 0) >= 2;
  const useEllipseEmitter =
    input.emitterKind === "ellipse" && (input.emitterRadiusX !== undefined || input.emitterRadiusY !== undefined);

  const bundled = computeBundledParameters(c.lineCount, c.groupSize, c.groupGap, c.groupDisturb, rand);
  const polygons: StudioTaperedEffectPolygon[] = [];
  const center = { x: c.width * 0.5, y: c.height * 0.5 };

  for (let i = 0; i < bundled.length; i += 1) {
    const { param, bundleIndex } = bundled[i]!;
    const wFactor = Math.max(0.15, 1 + (rand() - 0.5) * 2 * c.widthJitter);
    const rawLenRatio = minLenRatio + rand() * (maxLenRatio - minLenRatio);
    const jitteredLen = alongSpan * rawLenRatio * Math.max(0.2, 1 + (rand() - 0.5) * c.lengthJitter);
    const lineAngle = baseAngleRad + ((rand() - 0.5) * 2 * c.angleJitterDeg * Math.PI) / 180;
    const lx = Math.cos(lineAngle);
    const ly = Math.sin(lineAngle);

    let startPt: EffectPoint2D;
    if (useCurveEmitter && input.referenceCurve) {
      const sampled = samplePolylineWithNormal(input.referenceCurve, param);
      const shift = (rand() - 0.5) * c.startGapJitter * alongSpan * 0.25;
      startPt = { x: sampled.point.x + lx * shift, y: sampled.point.y + ly * shift };
    } else if (useEllipseEmitter) {
      const erx = Math.max(8, input.emitterRadiusX ?? c.width * 0.35);
      const ery = Math.max(8, input.emitterRadiusY ?? c.height * 0.35);
      const theta = (param - 0.5) * Math.PI + baseAngleRad + Math.PI;
      startPt = { x: center.x + erx * Math.cos(theta), y: center.y + ery * Math.sin(theta) };
    } else if (input.scatterAcrossCanvas) {
      const crossOffset = (param - 0.5) * crossSpan;
      const alongOffset = (rand() - 0.5) * (alongSpan + jitteredLen * 0.4);
      startPt = {
        x: center.x + perpX * crossOffset + dirX * alongOffset - lx * jitteredLen * 0.5,
        y: center.y + perpY * crossOffset + dirY * alongOffset - ly * jitteredLen * 0.5,
      };
    } else {
      const crossOffset = (param - 0.5) * crossSpan;
      const edgeBack = -alongSpan * 0.5 + rand() * c.startGapJitter * alongSpan * 0.35;
      startPt = { x: center.x + perpX * crossOffset + dirX * edgeBack, y: center.y + perpY * crossOffset + dirY * edgeBack };
    }

    const clampedLen = Math.min(diag * 1.4, jitteredLen);
    polygons.push(
      buildTaperedTrajectoryPolygon({
        index: i,
        bundleIndex,
        start: startPt,
        end: { x: startPt.x + lx * clampedLen, y: startPt.y + ly * clampedLen },
        baseWidthPx: c.baseWidthPx * wFactor,
        taperIn: c.taperIn,
        taperOut: c.taperOut,
        curveAmount: c.curveAmount,
        curveSteps: c.curveSteps,
      }),
    );
  }

  const innerFill =
    input.innerFillEnabled === true
      ? buildEllipsePolygon(
          center.x,
          center.y,
          input.emitterRadiusX ?? c.width * 0.35,
          input.emitterRadiusY ?? c.height * 0.35,
          resolvedAngleDeg,
          input.innerFillColor ?? "#000000",
          input.innerFillOpacity ?? 0.18,
        )
      : null;

  return {
    kind: "speed",
    ...(presetId ? { presetId } : {}),
    seedHash: hashEffectSeed(c.seed),
    strokeColor: c.strokeColor,
    polygons,
    innerFill,
    bounds: { width: c.width, height: c.height },
  };
}

/** CSP 집중선·속도선 8종 표준 프리셋 카탈로그. */
export const STUDIO_EFFECT_LINE_V2_PRESETS: Readonly<
  Record<StudioEffectLinePresetId, StudioEffectLinePresetSpec>
> = Object.freeze({
  "scattered-focus": {
    id: "scattered-focus",
    kind: "focus",
    label: "성긴 집중선",
    description: "넓은 간격과 자연스러운 길이 지터로 가벼운 시선 유도를 만듭니다.",
    focusParams: { lineCount: 64, baseWidthPx: 2.2, taperIn: 0, taperOut: 1, groupSize: 2, groupGap: 0.7, groupDisturb: 0.45, lengthJitter: 0.35, widthJitter: 0.25, startGapJitter: 0.35 },
  },
  "dense-focus": {
    id: "dense-focus",
    kind: "focus",
    label: "조밀 집중선",
    description: "촘촘한 다발 밀도로 강한 놀람·클라이맥스 초점을 형성합니다.",
    focusParams: { lineCount: 180, baseWidthPx: 3.4, taperIn: 0, taperOut: 1, groupSize: 4, groupGap: 0.2, groupDisturb: 0.25, lengthJitter: 0.22, widthJitter: 0.3, startGapJitter: 0.2 },
  },
  "dark-curved-focus": {
    id: "dark-curved-focus",
    kind: "focus",
    label: "어두운 곡선 집중선",
    description: "굵은 먹선과 소용돌이 2차 베지어 궤적, 내부 마스크 채움을 결합합니다.",
    focusParams: { lineCount: 150, baseWidthPx: 6.2, taperIn: 0, taperOut: 0.95, groupSize: 3, groupGap: 0.15, groupDisturb: 0.3, curveAmount: 0.38, curveSteps: 12, innerFillEnabled: true, innerFillColor: "#ffffff", innerFillOpacity: 0.92 },
  },
  burst: {
    id: "burst",
    kind: "focus",
    label: "폭발 집중선",
    description: "강한 다발 군집과 굵기 대비로 타격·폭발 순간을 강조합니다.",
    focusParams: { lineCount: 140, baseWidthPx: 5.4, taperIn: 0.15, taperOut: 1, groupSize: 5, groupGap: 0.55, groupDisturb: 0.5, lengthJitter: 0.45, widthJitter: 0.5, angleJitterDeg: 2.2, startGapJitter: 0.42 },
  },
  "scattered-speed": {
    id: "scattered-speed",
    kind: "speed",
    label: "성긴 속도선",
    description: "여백을 살린 가벼운 가로 질주 속도선을 배치합니다.",
    speedParams: { angleDeg: 0, lineCount: 44, baseWidthPx: 2.2, taperIn: 0.35, taperOut: 1, groupSize: 2, groupGap: 0.8, groupDisturb: 0.4, scatterAcrossCanvas: true, minLengthRatio: 0.22, maxLengthRatio: 0.68 },
  },
  "dark-speed": {
    id: "dark-speed",
    kind: "speed",
    label: "어두운 속도선",
    description: "묵직한 먹 다발로 고속 돌진·충격 배경을 채웁니다.",
    speedParams: { angleDeg: 0, lineCount: 130, baseWidthPx: 5.2, taperIn: 0, taperOut: 0.95, groupSize: 4, groupGap: 0.22, groupDisturb: 0.3, minLengthRatio: 0.55, maxLengthRatio: 0.98 },
  },
  gloom: {
    id: "gloom",
    kind: "speed",
    label: "침울선",
    description: "상단에서 아래로 무겁게 드리워 끝이 가늘어지는 세로 암울 효과선입니다.",
    speedParams: { angleDeg: 90, direction: "vertical", lineCount: 92, baseWidthPx: 3.8, taperIn: 0, taperOut: 1, groupSize: 3, groupGap: 0.18, groupDisturb: 0.2, startGapJitter: 0.06, lengthJitter: 0.22, angleJitterDeg: 0.25, minLengthRatio: 0.35, maxLengthRatio: 0.65 },
  },
  rain: {
    id: "rain",
    kind: "speed",
    label: "빗줄기",
    description: "사선 각도로 화면 전역에 흩뿌려지는 양끝 테이퍼 빗방울 궤적입니다.",
    speedParams: { angleDeg: 76, direction: "vertical", lineCount: 110, baseWidthPx: 1.6, taperIn: 0.85, taperOut: 0.9, groupSize: 1, groupGap: 0.35, groupDisturb: 0.75, scatterAcrossCanvas: true, minLengthRatio: 0.12, maxLengthRatio: 0.34, angleJitterDeg: 0.8 },
  },
});

export function planEffectLinesFromPreset(
  presetId: StudioEffectLinePresetId,
  bounds: { readonly width: number; readonly height: number },
  seed: string | number = presetId,
): StudioEffectLinePlanV2 {
  const spec = STUDIO_EFFECT_LINE_V2_PRESETS[presetId];
  if (spec.kind === "focus") {
    return planFocusLinesV2(
      { ...spec.focusParams, width: bounds.width, height: bounds.height, seed },
      presetId as StudioFocusPresetId,
    );
  }
  return planSpeedLinesV2(
    { ...spec.speedParams, width: bounds.width, height: bounds.height, seed },
    presetId as StudioSpeedPresetId,
  );
}

/** 인스펙터에서 기존 FocusLinesEl / SpeedLinesEl 필드로 안전하게 투영하는 패치 변환기. */
export function effectLinePresetToElementPatch(
  presetId: StudioEffectLinePresetId,
): Partial<FocusLinesEl> | Partial<SpeedLinesEl> {
  const spec = STUDIO_EFFECT_LINE_V2_PRESETS[presetId];
  if (spec.kind === "focus") {
    const f = spec.focusParams ?? {};
    return {
      lineCount: f.lineCount ?? 96,
      strokeWidth: f.baseWidthPx ?? 3.2,
      noise: Math.round(((f.lengthJitter ?? 0.25) + (f.startGapJitter ?? 0.2)) * 60),
      innerRadius: f.innerRadiusX ?? 110,
      outerRadius: f.outerRadius ?? 480,
    };
  }
  const s = spec.speedParams ?? {};
  const vertical = (s.angleDeg ?? 0) >= 45 && (s.angleDeg ?? 0) <= 135;
  return {
    direction: vertical ? "vertical" : "horizontal",
    lineCount: s.lineCount ?? 64,
    strokeWidth: s.baseWidthPx ?? 2.8,
    noise: Math.round((s.lengthJitter ?? 0.25) * 80),
  };
}
