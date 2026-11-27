/**
 * Wave-36: 감정 구동 한국어 의성어·의태어(SFX) 스플라인 포락선 워퍼 및 안전 영역 클리핑 집중선·속도선 생성기.
 *
 * 3차 베지어 곡선의 실제 호 길이(Arc-Length) 매개변수화를 따라 글리프 사각 프레임을
 * 4종 감정 프로파일(`impact-burst`, `whisper-tremor`, `speed-whoosh`, `heavy-thud`)로 비선형 변형한다.
 * 또한 결정론적 방사형 집중선(`radial-focus`)과 평행 속도선(`parallel-speed`)을 합성하되,
 * 인물 얼굴 및 말풍선 회전 타원 안전 영역 내부를 해석적 이차방정식 구간 차집합으로 완벽히 절단한다.
 */

/** 2차원 좌표(px). */
export interface SfxPoint2D { readonly x: number; readonly y: number }

/** 축 정렬 사각형 영역(px). */
export interface SfxRect2D { readonly height: number; readonly width: number; readonly x: number; readonly y: number }

/** 축 정렬 외접 경계 상자(px). */
export interface SfxAxisAlignedBounds2D {
  readonly height: number; readonly maxX: number; readonly maxY: number;
  readonly minX: number; readonly minY: number; readonly width: number;
}

/** 의성어·의태어 리본이 따라 흐르는 3차 베지어 중심선. */
export interface CubicBezierSpine2D {
  readonly p0: SfxPoint2D; readonly p1: SfxPoint2D; readonly p2: SfxPoint2D; readonly p3: SfxPoint2D;
}

/** 감정 기반 의성어·의태어 연출 프로파일 식별자. */
export type SfxEmotionProfileId = "heavy-thud" | "impact-burst" | "speed-whoosh" | "whisper-tremor";

/** 감정 프로파일별 기하 변형 계수 명세. */
export interface SfxEmotionEnvelopeSpec {
  readonly endScaleX: number;
  readonly endScaleY: number;
  readonly gravitySagPx: number;
  readonly jitterAmplitudePx: number;
  readonly profileId: SfxEmotionProfileId;
  readonly shearAngleDeg: number;
  readonly startScaleX: number;
  readonly startScaleY: number;
  readonly strokeWeightMultiplier: number;
  readonly trackingMultiplier: number;
}

/** 보정된 4종 한국어 웹툰 의성어·의태어 감정 프로파일 사전. */
export const SFX_EMOTION_PROFILES: Readonly<Record<SfxEmotionProfileId, SfxEmotionEnvelopeSpec>> = {
  "impact-burst": {
    profileId: "impact-burst", startScaleX: 0.88, startScaleY: 0.9, endScaleX: 1.46, endScaleY: 1.52,
    shearAngleDeg: 8, jitterAmplitudePx: 2.5, gravitySagPx: 0, strokeWeightMultiplier: 1.38, trackingMultiplier: 1.08,
  },
  "whisper-tremor": {
    profileId: "whisper-tremor", startScaleX: 0.84, startScaleY: 0.86, endScaleX: 0.86, endScaleY: 0.88,
    shearAngleDeg: 0, jitterAmplitudePx: 5.5, gravitySagPx: 0, strokeWeightMultiplier: 0.76, trackingMultiplier: 1.04,
  },
  "speed-whoosh": {
    profileId: "speed-whoosh", startScaleX: 1.24, startScaleY: 1.12, endScaleX: 0.72, endScaleY: 0.68,
    shearAngleDeg: 24, jitterAmplitudePx: 0, gravitySagPx: 0, strokeWeightMultiplier: 1.05, trackingMultiplier: 1.15,
  },
  "heavy-thud": {
    profileId: "heavy-thud", startScaleX: 1.12, startScaleY: 0.88, endScaleX: 1.28, endScaleY: 0.82,
    shearAngleDeg: -4, jitterAmplitudePx: 0, gravitySagPx: 14, strokeWeightMultiplier: 1.48, trackingMultiplier: 0.96,
  },
};

/** 변형 전 개별 글리프 메트릭 입력. */
export interface SfxGlyphFrameInput {
  readonly advancePx?: number;
  readonly baselineOffsetPx?: number;
  readonly char: string;
  readonly glyphId: string;
  readonly heightPx: number;
  readonly widthPx: number;
}

/** 스플라인 기반 의성어·의태어 글리프 리본 워프 입력. */
export interface SfxRibbonWarpInput {
  readonly edgeMarginRatio?: number;
  readonly emotionProfile: SfxEmotionProfileId;
  readonly glyphs: readonly SfxGlyphFrameInput[];
  readonly intensity?: number;
  readonly seed?: number;
  readonly spine: CubicBezierSpine2D;
}

/** 스플라인 법선·접선 프레임을 따라 변형된 단일 글리프 사각형(`[좌상, 우상, 우하, 좌하]`). */
export interface WarpedSfxGlyphQuad {
  readonly anchor: SfxPoint2D;
  readonly arcDistancePx: number;
  readonly char: string;
  readonly glyphId: string;
  readonly quad: readonly [SfxPoint2D, SfxPoint2D, SfxPoint2D, SfxPoint2D];
  readonly quadAreaPx2: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly shearTan: number;
  readonly spineParamT: number;
  readonly strokeWeightMultiplier: number;
  readonly tangentAngleRad: number;
}

/** 의성어·의태어 리본 워프 결과. */
export interface SfxRibbonWarpResult {
  readonly emotionProfile: SfxEmotionProfileId;
  readonly ribbonBounds: SfxAxisAlignedBounds2D;
  readonly totalSpineArcLengthPx: number;
  readonly warpedGlyphs: readonly WarpedSfxGlyphQuad[];
}

/** 인물 얼굴·말풍선 침범 방지를 위한 회전 타원 안전 영역. */
export interface SafeZoneEllipse {
  readonly center: SfxPoint2D;
  readonly featherPaddingPx?: number;
  readonly id: string;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotationDeg?: number;
}

/** 절차적 연출선 종류 (`radial-focus` = 집중선, `parallel-speed` = 속도선). */
export type ProceduralActionLineKind = "parallel-speed" | "radial-focus";

/** 절차적 집중선·속도선 생성 입력. */
export interface ProceduralActionLineInput {
  readonly baseStrokeWidthPx?: number;
  readonly directionAngleDeg?: number;
  readonly focusCenter?: SfxPoint2D;
  readonly innerClearRadiusPx?: number;
  readonly kind: ProceduralActionLineKind;
  readonly lineCount: number;
  readonly minSegmentLengthPx?: number;
  readonly panelBounds: SfxRect2D;
  readonly safeEllipses?: readonly SafeZoneEllipse[];
  readonly seed?: number;
}

/** 안전 영역 외부로 깨끗하게 클리핑된 단일 연출선 벡터 선분. */
export interface ClippedActionLineSegment {
  readonly end: SfxPoint2D;
  readonly endWidthPx: number;
  readonly kind: ProceduralActionLineKind;
  readonly lengthPx: number;
  readonly lineIndex: number;
  readonly start: SfxPoint2D;
  readonly startWidthPx: number;
  readonly subSegmentIndex: number;
}

/** 절차적 집중선·속도선 합성 결과. */
export interface ProceduralActionLineResult {
  readonly clippedLineCount: number;
  readonly kind: ProceduralActionLineKind;
  readonly requestedLineCount: number;
  readonly safeZoneViolationCount: number;
  readonly segments: readonly ClippedActionLineSegment[];
}

interface ArcLengthLut {
  readonly cumulativeLengths: Float64Array;
  readonly sampleCount: number;
  readonly totalLength: number;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = Math.imul(state ^ (state >>> 15), 1 | state);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function lerpPoint(a: SfxPoint2D, b: SfxPoint2D, u: number): SfxPoint2D {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** 3차 베지어 스플라인의 매개변수 `t` (`[0..1]`) 좌표를 평가한다. */
export function evaluateCubicBezierPoint(spine: CubicBezierSpine2D, t: number): SfxPoint2D {
  const u = clamp(t, 0, 1);
  const inv = 1 - u;
  const b0 = inv * inv * inv;
  const b1 = 3 * inv * inv * u;
  const b2 = 3 * inv * u * u;
  const b3 = u * u * u;
  return {
    x: b0 * spine.p0.x + b1 * spine.p1.x + b2 * spine.p2.x + b3 * spine.p3.x,
    y: b0 * spine.p0.y + b1 * spine.p1.y + b2 * spine.p2.y + b3 * spine.p3.y,
  };
}

/** 3차 베지어 스플라인의 매개변수 `t` (`[0..1]`) 단위 접선 벡터를 평가한다. */
export function evaluateCubicBezierTangent(spine: CubicBezierSpine2D, t: number): SfxPoint2D {
  const u = clamp(t, 0, 1);
  const inv = 1 - u;
  const c0 = 3 * inv * inv;
  const c1 = 6 * inv * u;
  const c2 = 3 * u * u;
  const dx = c0 * (spine.p1.x - spine.p0.x) + c1 * (spine.p2.x - spine.p1.x) + c2 * (spine.p3.x - spine.p2.x);
  const dy = c0 * (spine.p1.y - spine.p0.y) + c1 * (spine.p2.y - spine.p1.y) + c2 * (spine.p3.y - spine.p2.y);
  const norm = Math.hypot(dx, dy);
  if (norm < 1e-8) {
    const chordNorm = Math.hypot(spine.p3.x - spine.p0.x, spine.p3.y - spine.p0.y);
    return chordNorm > 1e-8
      ? { x: (spine.p3.x - spine.p0.x) / chordNorm, y: (spine.p3.y - spine.p0.y) / chordNorm }
      : { x: 1, y: 0 };
  }
  return { x: dx / norm, y: dy / norm };
}

function buildArcLengthLut(spine: CubicBezierSpine2D, steps = 160): ArcLengthLut {
  const sampleCount = Math.max(16, steps);
  const cumulativeLengths = new Float64Array(sampleCount + 1);
  let prev = evaluateCubicBezierPoint(spine, 0);
  let acc = 0;
  for (let i = 1; i <= sampleCount; i += 1) {
    const curr = evaluateCubicBezierPoint(spine, i / sampleCount);
    acc += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    cumulativeLengths[i] = acc;
    prev = curr;
  }
  return { cumulativeLengths, sampleCount, totalLength: acc };
}

function mapArcDistanceToT(lut: ArcLengthLut, targetArcPx: number): number {
  if (lut.totalLength <= 1e-8) return 0;
  const clampedArc = clamp(targetArcPx, 0, lut.totalLength);
  let low = 0;
  let high = lut.sampleCount;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((lut.cumulativeLengths[mid] ?? 0) < clampedArc) low = mid + 1;
    else high = mid;
  }
  if (low === 0) return 0;
  const prevLen = lut.cumulativeLengths[low - 1] ?? 0;
  const span = (lut.cumulativeLengths[low] ?? prevLen) - prevLen;
  return clamp((low - 1 + (span > 1e-9 ? (clampedArc - prevLen) / span : 0)) / lut.sampleCount, 0, 1);
}

function computeQuadArea(quad: readonly [SfxPoint2D, SfxPoint2D, SfxPoint2D, SfxPoint2D]): number {
  let twiceSigned = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    if (a && b) twiceSigned += a.x * b.y - b.x * a.y;
  }
  return 0.5 * Math.abs(twiceSigned);
}

/** 글리프 시퀀스를 3차 베지어 스플라인의 등거리 호 길이와 감정 프로파일 포락선에 맞춰 워핑한다. */
export function warpSfxGlyphFramesAlongSpine(input: SfxRibbonWarpInput): SfxRibbonWarpResult {
  const spec = SFX_EMOTION_PROFILES[input.emotionProfile];
  const intensity = clamp(input.intensity ?? 1, 0, 2);
  const marginRatio = clamp(input.edgeMarginRatio ?? 0.06, 0, 0.35);
  const rng = createMulberry32(input.seed ?? 20261127);
  const lut = buildArcLengthLut(input.spine, 160);

  if (input.glyphs.length === 0) {
    const p0 = evaluateCubicBezierPoint(input.spine, 0);
    return {
      emotionProfile: input.emotionProfile,
      ribbonBounds: { minX: p0.x, minY: p0.y, maxX: p0.x, maxY: p0.y, width: 0, height: 0 },
      totalSpineArcLengthPx: lut.totalLength,
      warpedGlyphs: [],
    };
  }

  const usableStartArc = lut.totalLength * marginRatio;
  const usableSpanArc = Math.max(0, lut.totalLength * (1 - 2 * marginRatio));
  const trackingGain = 1 + (spec.trackingMultiplier - 1) * intensity;
  const rawAdvances = input.glyphs.map((g) => Math.max(1, g.advancePx ?? g.widthPx));
  const totalRawAdvance = rawAdvances.reduce((sum, adv) => sum + adv, 0) * trackingGain;
  const shearTan = Math.tan(clamp(((spec.shearAngleDeg * intensity) * Math.PI) / 180, -1.1, 1.1));
  const strokeWeightMultiplier = Math.max(0.25, 1 + (spec.strokeWeightMultiplier - 1) * intensity);

  const warpedGlyphs: WarpedSfxGlyphQuad[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let cursorAdvance = 0;
  const count = input.glyphs.length;

  for (let i = 0; i < count; i += 1) {
    const glyph = input.glyphs[i];
    const adv = rawAdvances[i];
    if (!glyph || adv === undefined) continue;

    const progress = count === 1 ? 0.5 : i / (count - 1);
    const centerFrac = totalRawAdvance > 0 ? ((cursorAdvance + 0.5 * adv) * trackingGain) / totalRawAdvance : (i + 0.5) / count;
    cursorAdvance += adv;

    const targetArcPx = usableStartArc + clamp(centerFrac, 0, 1) * usableSpanArc;
    const t = mapArcDistanceToT(lut, targetArcPx);
    const basePoint = evaluateCubicBezierPoint(input.spine, t);
    const unitTangent = evaluateCubicBezierTangent(input.spine, t);
    const unitUpNormal: SfxPoint2D = { x: unitTangent.y, y: -unitTangent.x };

    const scaleX = Math.max(0.2, 1 + (spec.startScaleX + (spec.endScaleX - spec.startScaleX) * progress - 1) * intensity);
    const scaleY = Math.max(0.2, 1 + (spec.startScaleY + (spec.endScaleY - spec.startScaleY) * progress - 1) * intensity);
    const jitterPhase = (rng() - 0.5) * 2;
    const normalJitterPx = input.emotionProfile === "whisper-tremor"
      ? Math.sin((i + 1) * 2.35 + jitterPhase * Math.PI) * spec.jitterAmplitudePx * intensity
      : jitterPhase * spec.jitterAmplitudePx * intensity;
    const gravityOffsetY = input.emotionProfile === "heavy-thud" ? spec.gravitySagPx * (0.45 + 0.55 * progress) * intensity : 0;
    const normalShift = normalJitterPx + (glyph.baselineOffsetPx ?? 0) * scaleY;
    const anchor: SfxPoint2D = {
      x: basePoint.x + unitUpNormal.x * normalShift,
      y: basePoint.y + unitUpNormal.y * normalShift + gravityOffsetY,
    };

    const halfW = 0.5 * Math.max(1, glyph.widthPx) * scaleX;
    const halfH = 0.5 * Math.max(1, glyph.heightPx) * scaleY;
    const corner = (lx: number, lyUp: number): SfxPoint2D => {
      const sx = lx + lyUp * shearTan;
      return { x: anchor.x + unitTangent.x * sx + unitUpNormal.x * lyUp, y: anchor.y + unitTangent.y * sx + unitUpNormal.y * lyUp };
    };

    const quad: readonly [SfxPoint2D, SfxPoint2D, SfxPoint2D, SfxPoint2D] = [
      corner(-halfW, halfH), corner(halfW, halfH), corner(halfW, -halfH), corner(-halfW, -halfH),
    ];
    for (const pt of quad) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }

    warpedGlyphs.push({
      anchor, arcDistancePx: targetArcPx, char: glyph.char, glyphId: glyph.glyphId, quad,
      quadAreaPx2: computeQuadArea(quad), scaleX, scaleY, shearTan, spineParamT: t,
      strokeWeightMultiplier, tangentAngleRad: Math.atan2(unitTangent.y, unitTangent.x),
    });
  }

  return {
    emotionProfile: input.emotionProfile,
    ribbonBounds: { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) },
    totalSpineArcLengthPx: lut.totalLength,
    warpedGlyphs,
  };
}

/** 주어진 점이 회전·페더링이 반영된 안전 타원 내부(엄격한 개집합 내부)에 속하는지 판정한다. */
export function isPointInsideSafeEllipse(point: SfxPoint2D, ellipse: SafeZoneEllipse, tolerance = 1e-6): boolean {
  const pad = Math.max(0, ellipse.featherPaddingPx ?? 0);
  const rx = ellipse.radiusX + pad;
  const ry = ellipse.radiusY + pad;
  if (rx <= 0 || ry <= 0) return false;
  const rad = ((ellipse.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - ellipse.center.x;
  const dy = point.y - ellipse.center.y;
  const localX = (dx * cos + dy * sin) / rx;
  const localY = (-dx * sin + dy * cos) / ry;
  return localX * localX + localY * localY < 1 - tolerance;
}

function clipSegmentToRect(start: SfxPoint2D, end: SfxPoint2D, rect: SfxRect2D): readonly [number, number] | null {
  const p = [-(end.x - start.x), end.x - start.x, -(end.y - start.y), end.y - start.y];
  const q = [start.x - rect.x, rect.x + rect.width - start.x, start.y - rect.y, rect.y + rect.height - start.y];
  let u1 = 0;
  let u2 = 1;
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i] ?? 0;
    const qi = q[i] ?? 0;
    if (Math.abs(pi) < 1e-12) {
      if (qi < 0) return null;
      continue;
    }
    const r = qi / pi;
    if (pi < 0) {
      if (r > u2) return null;
      if (r > u1) u1 = r;
    } else {
      if (r < u1) return null;
      if (r < u2) u2 = r;
    }
  }
  return u1 <= u2 ? [u1, u2] : null;
}

function clipIntervalsOutsideEllipse(
  segStart: SfxPoint2D,
  segEnd: SfxPoint2D,
  intervals: ReadonlyArray<readonly [number, number]>,
  ellipse: SafeZoneEllipse,
): Array<readonly [number, number]> {
  const pad = Math.max(0, ellipse.featherPaddingPx ?? 0);
  const rx = ellipse.radiusX + pad;
  const ry = ellipse.radiusY + pad;
  if (rx <= 0 || ry <= 0 || intervals.length === 0) return [...intervals];

  const rad = ((ellipse.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const toNorm = (pt: SfxPoint2D): SfxPoint2D => ({
    x: ((pt.x - ellipse.center.x) * cos + (pt.y - ellipse.center.y) * sin) / rx,
    y: (-(pt.x - ellipse.center.x) * sin + (pt.y - ellipse.center.y) * cos) / ry,
  });

  const aPt = toNorm(segStart);
  const bPt = toNorm(segEnd);
  const dx = bPt.x - aPt.x;
  const dy = bPt.y - aPt.y;
  const quadA = dx * dx + dy * dy;
  const quadB = 2 * (aPt.x * dx + aPt.y * dy);
  const quadC = aPt.x * aPt.x + aPt.y * aPt.y - 1;
  if (quadA < 1e-12) return quadC < 1e-7 ? [] : [...intervals];
  const disc = quadB * quadB - 4 * quadA * quadC;
  if (disc <= 0) return [...intervals];

  const sqrtDisc = Math.sqrt(disc);
  const forbidStart = (-quadB - sqrtDisc) / (2 * quadA) - 1e-5;
  const forbidEnd = (-quadB + sqrtDisc) / (2 * quadA) + 1e-5;
  const next: Array<readonly [number, number]> = [];
  for (const [a, b] of intervals) {
    if (forbidEnd <= a || forbidStart >= b) next.push([a, b]);
    else {
      if (forbidStart > a) next.push([a, forbidStart]);
      if (forbidEnd < b) next.push([forbidEnd, b]);
    }
  }
  return next;
}

/**
 * 결정론적 방사형 집중선(`radial-focus`) 또는 평행 속도선(`parallel-speed`)을 합성하고,
 * 인물 얼굴·말풍선 안전 타원(`safeEllipses`) 내부를 해석적으로 절단한다.
 */
export function generateProceduralActionLines(input: ProceduralActionLineInput): ProceduralActionLineResult {
  const requestedLineCount = Math.max(0, Math.floor(input.lineCount));
  const panel = input.panelBounds;
  if (requestedLineCount === 0 || panel.width <= 0 || panel.height <= 0) {
    return { clippedLineCount: 0, kind: input.kind, requestedLineCount, safeZoneViolationCount: 0, segments: [] };
  }

  const rng = createMulberry32(input.seed ?? 20261127);
  const baseStrokeWidthPx = Math.max(0.4, input.baseStrokeWidthPx ?? 2.6);
  const minSegmentLengthPx = Math.max(1, input.minSegmentLengthPx ?? 6);
  const userEllipses = input.safeEllipses ?? [];
  const focusCenter: SfxPoint2D = input.focusCenter ?? { x: panel.x + 0.5 * panel.width, y: panel.y + 0.5 * panel.height };
  const innerClearRadiusPx = Math.max(0, input.innerClearRadiusPx ?? 56);
  const effectiveEllipses: SafeZoneEllipse[] = input.kind === "radial-focus" && innerClearRadiusPx > 0
    ? [{ center: focusCenter, id: "__focus_core_halo__", radiusX: innerClearRadiusPx, radiusY: innerClearRadiusPx }, ...userEllipses]
    : [...userEllipses];

  const diag = Math.hypot(panel.width, panel.height) + 16;
  const rawLines: Array<{ end: SfxPoint2D; lineIndex: number; start: SfxPoint2D; weightJitter: number }> = [];

  if (input.kind === "radial-focus") {
    for (let i = 0; i < requestedLineCount; i += 1) {
      const angle = ((i + 0.5 + (rng() - 0.5) * 0.55) / requestedLineCount) * Math.PI * 2;
      const outerPt: SfxPoint2D = { x: focusCenter.x + Math.cos(angle) * diag, y: focusCenter.y + Math.sin(angle) * diag };
      const rectClip = clipSegmentToRect(outerPt, focusCenter, panel);
      if (rectClip) {
        rawLines.push({ end: lerpPoint(outerPt, focusCenter, rectClip[1]), lineIndex: i, start: lerpPoint(outerPt, focusCenter, rectClip[0]), weightJitter: 0.75 + rng() * 0.55 });
      }
    }
  } else {
    const rad = ((input.directionAngleDeg ?? 0) * Math.PI) / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    const perpX = -dirY;
    const perpY = dirX;
    const corners = [
      { x: panel.x, y: panel.y }, { x: panel.x + panel.width, y: panel.y },
      { x: panel.x + panel.width, y: panel.y + panel.height }, { x: panel.x, y: panel.y + panel.height },
    ];
    let minPerp = Number.POSITIVE_INFINITY;
    let maxPerp = Number.NEGATIVE_INFINITY;
    let minAlong = Number.POSITIVE_INFINITY;
    let maxAlong = Number.NEGATIVE_INFINITY;
    for (const c of corners) {
      minPerp = Math.min(minPerp, c.x * perpX + c.y * perpY);
      maxPerp = Math.max(maxPerp, c.x * perpX + c.y * perpY);
      minAlong = Math.min(minAlong, c.x * dirX + c.y * dirY);
      maxAlong = Math.max(maxAlong, c.x * dirX + c.y * dirY);
    }
    const perpSpan = Math.max(1, maxPerp - minPerp);
    for (let i = 0; i < requestedLineCount; i += 1) {
      const v = minPerp + ((i + 0.5 + (rng() - 0.5) * 0.5) / requestedLineCount) * perpSpan;
      const candStart = { x: perpX * v + dirX * (minAlong - 16), y: perpY * v + dirY * (minAlong - 16) };
      const candEnd = { x: perpX * v + dirX * (maxAlong + 16), y: perpY * v + dirY * (maxAlong + 16) };
      const rectClip = clipSegmentToRect(candStart, candEnd, panel);
      if (rectClip) {
        rawLines.push({ end: lerpPoint(candStart, candEnd, rectClip[1]), lineIndex: i, start: lerpPoint(candStart, candEnd, rectClip[0]), weightJitter: 0.75 + rng() * 0.55 });
      }
    }
  }

  const segments: ClippedActionLineSegment[] = [];
  let clippedLineCount = 0;
  let safeZoneViolationCount = 0;

  for (const raw of rawLines) {
    let activeIntervals: Array<readonly [number, number]> = [[0, 1]];
    for (const ellipse of effectiveEllipses) {
      activeIntervals = clipIntervalsOutsideEllipse(raw.start, raw.end, activeIntervals, ellipse);
      if (activeIntervals.length === 0) break;
    }
    if (activeIntervals.length !== 1 || (activeIntervals[0]?.[0] ?? 0) > 1e-4 || (activeIntervals[0]?.[1] ?? 1) < 1 - 1e-4) {
      clippedLineCount += 1;
    }
    const fullLen = Math.hypot(raw.end.x - raw.start.x, raw.end.y - raw.start.y);
    let subIdx = 0;
    for (const [uA, uB] of activeIntervals) {
      const segLen = (uB - uA) * fullLen;
      if (segLen < minSegmentLengthPx) continue;
      const startPt = lerpPoint(raw.start, raw.end, uA);
      const endPt = lerpPoint(raw.start, raw.end, uB);
      const midPt = lerpPoint(startPt, endPt, 0.5);
      for (const ue of userEllipses) {
        if (isPointInsideSafeEllipse(startPt, ue) || isPointInsideSafeEllipse(midPt, ue) || isPointInsideSafeEllipse(endPt, ue)) {
          safeZoneViolationCount += 1;
        }
      }
      const outerStroke = baseStrokeWidthPx * raw.weightJitter;
      const innerStroke = Math.max(0.3, outerStroke * 0.18);
      segments.push({
        end: endPt, endWidthPx: outerStroke + (innerStroke - outerStroke) * uB, kind: input.kind,
        lengthPx: segLen, lineIndex: raw.lineIndex, start: startPt,
        startWidthPx: outerStroke + (innerStroke - outerStroke) * uA, subSegmentIndex: subIdx,
      });
      subIdx += 1;
    }
  }

  return { clippedLineCount, kind: input.kind, requestedLineCount, safeZoneViolationCount, segments };
}
