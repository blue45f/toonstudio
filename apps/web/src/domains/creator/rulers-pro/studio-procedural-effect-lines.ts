/**
 * 절차적 만화 효과선 벡터 생성기 (집중선 · 스피드선 · 유선 · 폭발선).
 *
 * - 결정적 시드(`seed`) 기반 PRNG로 동일 입력에 대해 항상 동일한 SVG/폴리곤 스트립을 생성한다.
 * - 집중선(타원 중심·밀도·지터·불균일 간격·양끝 테이퍼), 스피드선(임의 각도·가변 굵기·파선),
 *   유선(3차 베지어 곡선 추적), 폭발선(별형 충격파 + 외곽 컷 프레임 클리핑)을 제공한다.
 */

import {
  buildTaperedRibbonPolygon,
  clampEffectNumber,
  createDeterministicPrng,
  evaluateCubicBezierPoint,
  evaluateCubicBezierTangent,
  finalizeEffectResult,
  finalizeEffectStrip,
  normalizeEffectSeed,
  splitPolylineIntoDashes,
} from "./studio-effect-lines-geometry";

import type {
  BurstEffectLineOptions,
  ConcentrationEffectLineOptions,
  EffectPolygonStrip,
  EffectTaperMode,
  FlowEffectLineOptions,
  Point2D,
  ProceduralEffectLineConfig,
  ProceduralEffectLinePreset,
  ProceduralEffectLineResult,
  SpeedEffectLineOptions,
} from "./studio-effect-lines-types";

export * from "./studio-effect-lines-types";
export {
  clipPolygonToCutFrame,
  clipSegmentToCutFrame,
  createDeterministicPrng,
  evaluateCubicBezierPoint,
  evaluateCubicBezierTangent,
  isPointInsideCutFrame,
  normalizeEffectSeed,
  proceduralEffectToStudioElementPatch,
  renderProceduralEffectLinesToSvg,
} from "./studio-effect-lines-geometry";

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;

function isDegreeInExclusion(deg: number, from: number, to: number): boolean {
  const norm = (value: number): number => ((value % 360) + 360) % 360;
  const a = norm(deg);
  const f = norm(from);
  const t = norm(to);
  if (Math.abs(f - t) <= 1e-6) return false;
  return f < t ? a >= f && a <= t : a >= f || a <= t;
}

/** 1) 집중선 생성기 — 방사형 타원 중심·밀도·랜덤 지터·불균일 간격·양끝 테이퍼링·컷 클리핑. */
export function generateConcentrationEffectLines(
  options: ConcentrationEffectLineOptions,
): ProceduralEffectLineResult {
  const seed = normalizeEffectSeed(options.seed);
  const random = createDeterministicPrng(seed);
  const lineCount = Math.round(clampEffectNumber(options.lineCount, 1, 360));
  const rx = Math.max(1, options.innerRadiusX);
  const ry = Math.max(1, options.innerRadiusY);
  const outerR = Math.max(Math.max(rx, ry) + 4, options.outerRadius);
  const rotRad = (options.ellipseRotationDeg ?? 0) * DEG_TO_RAD;
  const cosRot = Math.cos(rotRad);
  const sinRot = Math.sin(rotRad);
  const baseWidth = clampEffectNumber(options.baseWidth, 0.4, 48);
  const widthJitter = clampEffectNumber(options.widthJitter ?? 0.35, 0, 0.95);
  const angleJitterRad = clampEffectNumber(options.angleJitterDeg ?? 2.2, 0, 45) * DEG_TO_RAD;
  const innerJitter = clampEffectNumber(options.innerRadiusJitter ?? 0.2, 0, 0.85);
  const lengthJitter = clampEffectNumber(options.lengthJitter ?? 0.15, 0, 0.85);
  const uneven = clampEffectNumber(options.unevenSpacing ?? 0.35, 0, 1);
  const clusters = Math.round(clampEffectNumber(options.clusterCount ?? 5, 1, 12));
  const taperMode: EffectTaperMode = options.taperMode ?? "inward";
  const tipWidth = clampEffectNumber(options.tipWidth ?? 0, 0, baseWidth);
  const taperExp = clampEffectNumber(options.taperExponent ?? 1.1, 0.4, 3.5);
  const opacity = clampEffectNumber(options.opacity ?? 1, 0.05, 1);
  const clipFrame = options.clipFrame ?? null;

  const clusterPhase = random() * TAU;
  const strips: EffectPolygonStrip[] = [];

  for (let i = 0; i < lineCount; i += 1) {
    const baseAngle = ((i + 0.5) / lineCount) * TAU;
    const warp = uneven * (0.42 / clusters) * Math.sin(clusters * baseAngle + clusterPhase);
    const theta = baseAngle + warp + (random() * 2 - 1) * angleJitterRad;
    const deg = theta / DEG_TO_RAD + (options.ellipseRotationDeg ?? 0);
    if (
      options.excludeAngleDeg &&
      isDegreeInExclusion(deg, options.excludeAngleDeg.from, options.excludeAngleDeg.to)
    ) {
      continue;
    }

    const innerScale = 1 + (random() * 2 - 1) * innerJitter;
    const localInX = Math.cos(theta) * rx * innerScale;
    const localInY = Math.sin(theta) * ry * innerScale;
    const dirLen = Math.hypot(localInX, localInY) || 1;
    const outerReach = outerR * (1 + (random() * 2 - 1) * lengthJitter);
    const radialSpan = Math.max(4, outerReach - dirLen);
    const localOutX = localInX + (localInX / dirLen) * radialSpan;
    const localOutY = localInY + (localInY / dirLen) * radialSpan;

    const p0: Point2D = {
      x: options.center.x + localInX * cosRot - localInY * sinRot,
      y: options.center.y + localInX * sinRot + localInY * cosRot,
    };
    const p1: Point2D = {
      x: options.center.x + localOutX * cosRot - localOutY * sinRot,
      y: options.center.y + localOutX * sinRot + localOutY * cosRot,
    };
    const width = Math.max(0.35, baseWidth * (1 + (random() * 2 - 1) * widthJitter));
    const poly = buildTaperedRibbonPolygon([p0, p1], width, tipWidth, taperMode, taperExp);
    const strip = finalizeEffectStrip(`concentration-${i}`, "concentration", poly, [p0, p1], width, opacity, clipFrame);
    if (strip) strips.push(strip);
  }

  return finalizeEffectResult("concentration", seed, strips, clipFrame);
}

/** 2) 스피드선 생성기 — 임의 각도·가변 굵기·불균일 간격·파선 분할·컷 클리핑. */
export function generateSpeedEffectLines(options: SpeedEffectLineOptions): ProceduralEffectLineResult {
  const seed = normalizeEffectSeed(options.seed);
  const random = createDeterministicPrng(seed);
  const lineCount = Math.round(clampEffectNumber(options.lineCount, 1, 320));
  const rad = options.angleDeg * DEG_TO_RAD;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const normX = -dirY;
  const normY = dirX;
  const spanWidth = Math.max(4, options.spanWidth);
  const baseLength = Math.max(6, options.length);
  const minWidth = clampEffectNumber(options.minWidth, 0.3, 40);
  const maxWidth = Math.max(minWidth, clampEffectNumber(options.maxWidth, 0.3, 60));
  const uneven = clampEffectNumber(options.unevenSpacing ?? 0.3, 0, 1);
  const posJitter = Math.max(0, options.positionJitter ?? baseLength * 0.14);
  const lenJitter = clampEffectNumber(options.lengthJitter ?? 0.25, 0, 0.85);
  const taperMode: EffectTaperMode = options.taperMode ?? "both";
  const dashEnabled = Boolean(options.dashEnabled);
  const dashLength = Math.max(6, options.dashLength ?? 48);
  const gapLength = Math.max(4, options.gapLength ?? 22);
  const dashJitter = clampEffectNumber(options.dashJitter ?? 0.25, 0, 0.75);
  const opacity = clampEffectNumber(options.opacity ?? 1, 0.05, 1);
  const clipFrame = options.clipFrame ?? null;

  const strips: EffectPolygonStrip[] = [];
  const wavePhase = random() * TAU;

  for (let i = 0; i < lineCount; i += 1) {
    const u = lineCount === 1 ? 0 : (i / (lineCount - 1)) * 2 - 1;
    const warpedU = clampEffectNumber(
      u + uneven * 0.22 * Math.sin(u * Math.PI * 3 + wavePhase) + uneven * (random() * 2 - 1) * (1 / Math.max(2, lineCount)),
      -1,
      1,
    );
    const lateralOffset = warpedU * (spanWidth * 0.5);
    const lineLen = Math.max(6, baseLength * (1 + (random() * 2 - 1) * lenJitter));
    const longitudinalShift = (random() * 2 - 1) * posJitter;
    const width = minWidth + random() * (maxWidth - minWidth);
    const anchorX = options.center.x + normX * lateralOffset + dirX * longitudinalShift;
    const anchorY = options.center.y + normY * lateralOffset + dirY * longitudinalShift;
    const startOffset = -lineLen * 0.5;

    if (!dashEnabled) {
      const p0: Point2D = { x: anchorX + dirX * startOffset, y: anchorY + dirY * startOffset };
      const p1: Point2D = { x: anchorX + dirX * (startOffset + lineLen), y: anchorY + dirY * (startOffset + lineLen) };
      const poly = buildTaperedRibbonPolygon([p0, p1], width, 0, taperMode, 1.0);
      const strip = finalizeEffectStrip(`speed-${i}`, "speed", poly, [p0, p1], width, opacity, clipFrame);
      if (strip) strips.push(strip);
      continue;
    }

    let cursor = startOffset + random() * Math.min(gapLength, lineLen * 0.25);
    const endCursor = startOffset + lineLen;
    let dashIndex = 0;
    while (cursor < endCursor - 3) {
      const segLen = Math.max(4, dashLength * (1 + (random() * 2 - 1) * dashJitter));
      const segEnd = Math.min(endCursor, cursor + segLen);
      if (segEnd - cursor >= 3) {
        const p0: Point2D = { x: anchorX + dirX * cursor, y: anchorY + dirY * cursor };
        const p1: Point2D = { x: anchorX + dirX * segEnd, y: anchorY + dirY * segEnd };
        const poly = buildTaperedRibbonPolygon([p0, p1], width, 0, taperMode, 1.0);
        const strip = finalizeEffectStrip(`speed-${i}-d${dashIndex}`, "speed", poly, [p0, p1], width, opacity, clipFrame);
        if (strip) strips.push(strip);
        dashIndex += 1;
      }
      cursor = segEnd + Math.max(3, gapLength * (1 + (random() * 2 - 1) * dashJitter));
    }
  }

  return finalizeEffectResult("speed", seed, strips, clipFrame);
}

/** 3) 유선(흐름선) 생성기 — 3차 베지어 곡선을 따라 법선 오프셋을 둔 다중 흐름선 생성. */
export function generateFlowEffectLines(options: FlowEffectLineOptions): ProceduralEffectLineResult {
  const seed = normalizeEffectSeed(options.seed);
  const random = createDeterministicPrng(seed);
  const lineCount = Math.round(clampEffectNumber(options.lineCount, 1, 200));
  const bandWidth = Math.max(2, options.bandWidth);
  const minWidth = clampEffectNumber(options.minWidth, 0.3, 30);
  const maxWidth = Math.max(minWidth, clampEffectNumber(options.maxWidth, 0.3, 48));
  const samples = Math.round(clampEffectNumber(options.samplesPerLine ?? 20, 4, 64));
  const uneven = clampEffectNumber(options.unevenSpacing ?? 0.25, 0, 1);
  const offsetJitter = clampEffectNumber(options.offsetJitter ?? 0.2, 0, 1);
  const trimJitter = clampEffectNumber(options.trimJitter ?? 0.16, 0, 0.38);
  const taperMode: EffectTaperMode = options.taperMode ?? "both";
  const dashEnabled = Boolean(options.dashEnabled);
  const dashLength = Math.max(8, options.dashLength ?? 56);
  const gapLength = Math.max(5, options.gapLength ?? 24);
  const opacity = clampEffectNumber(options.opacity ?? 1, 0.05, 1);
  const clipFrame = options.clipFrame ?? null;

  const strips: EffectPolygonStrip[] = [];
  const wavePhase = random() * TAU;

  for (let i = 0; i < lineCount; i += 1) {
    const u = lineCount === 1 ? 0 : (i / (lineCount - 1)) * 2 - 1;
    const warpedU = clampEffectNumber(
      u + uneven * 0.2 * Math.sin(u * Math.PI * 2.5 + wavePhase) + offsetJitter * (random() * 2 - 1) * (1 / Math.max(2, lineCount)),
      -1,
      1,
    );
    const normalOffset = warpedU * (bandWidth * 0.5);
    const tStart = random() * trimJitter;
    const tEnd = 1 - random() * trimJitter;
    if (tEnd - tStart < 0.12) continue;

    const width = minWidth + random() * (maxWidth - minWidth);
    const spine: Point2D[] = [];
    for (let s = 0; s <= samples; s += 1) {
      const t = tStart + ((tEnd - tStart) * s) / samples;
      const basePt = evaluateCubicBezierPoint(options.curve, t);
      const tangent = evaluateCubicBezierTangent(options.curve, t);
      spine.push({ x: basePt.x - tangent.y * normalOffset, y: basePt.y + tangent.x * normalOffset });
    }

    if (!dashEnabled) {
      const poly = buildTaperedRibbonPolygon(spine, width, 0, taperMode, 1.0);
      const strip = finalizeEffectStrip(`flow-${i}`, "flow", poly, spine, width, opacity, clipFrame);
      if (strip) strips.push(strip);
      continue;
    }

    splitPolylineIntoDashes(spine, dashLength, gapLength).forEach((subLine, dashIdx) => {
      const poly = buildTaperedRibbonPolygon(subLine, width, 0, taperMode, 1.0);
      const strip = finalizeEffectStrip(`flow-${i}-d${dashIdx}`, "flow", poly, subLine, width, opacity, clipFrame);
      if (strip) strips.push(strip);
    });
  }

  return finalizeEffectResult("flow", seed, strips, clipFrame);
}

/** 4) 폭발선(충격파) 생성기 — 별형 충격파 + 보조 파열선 + 외곽 컷 프레임 클리핑. */
export function generateBurstEffectLines(options: BurstEffectLineOptions): ProceduralEffectLineResult {
  const seed = normalizeEffectSeed(options.seed);
  const random = createDeterministicPrng(seed);
  const spikes = Math.round(clampEffectNumber(options.spikeCount, 4, 96));
  const rx = Math.max(4, options.innerRadiusX);
  const ry = Math.max(4, options.innerRadiusY);
  const outerR = Math.max(Math.max(rx, ry) + 12, options.outerRadius);
  const spikeJitter = clampEffectNumber(options.spikeJitter ?? 0.28, 0, 0.85);
  const rotRad = (options.rotationDeg ?? 0) * DEG_TO_RAD;
  const style = options.burstStyle ?? "star-plus-rays";
  const baseWidth = clampEffectNumber(options.baseWidth ?? 3.2, 0.5, 40);
  const opacity = clampEffectNumber(options.opacity ?? 1, 0.05, 1);
  const clipFrame = options.clipFrame ?? null;

  const strips: EffectPolygonStrip[] = [];
  const starInner: Point2D[] = [];
  const starOuter: Point2D[] = [];
  const angleStep = TAU / spikes;

  for (let i = 0; i < spikes; i += 1) {
    const thetaOuter = rotRad + i * angleStep + (random() * 2 - 1) * angleStep * 0.14;
    const thetaValley = rotRad + (i + 0.5) * angleStep;
    const outerReach = outerR * (1 + (random() * 2 - 1) * spikeJitter);
    const valleyScale = 1 + (random() * 2 - 1) * (spikeJitter * 0.35);
    starOuter.push({ x: options.center.x + Math.cos(thetaOuter) * outerReach, y: options.center.y + Math.sin(thetaOuter) * outerReach });
    starInner.push({ x: options.center.x + Math.cos(thetaValley) * rx * valleyScale, y: options.center.y + Math.sin(thetaValley) * ry * valleyScale });
  }

  for (let i = 0; i < spikes; i += 1) {
    const prevValley = starInner[(i - 1 + spikes) % spikes]!;
    const tip = starOuter[i]!;
    const nextValley = starInner[i]!;
    if (style === "spike-wedges") {
      const midBase: Point2D = { x: (prevValley.x + nextValley.x) * 0.5, y: (prevValley.y + nextValley.y) * 0.5 };
      const strip = finalizeEffectStrip(`burst-wedge-${i}`, "burst", [prevValley, tip, nextValley], [midBase, tip], baseWidth, opacity, clipFrame);
      if (strip) strips.push(strip);
      continue;
    }
    const edgeWidth = baseWidth * (0.85 + random() * 0.5);
    const leftStrip = finalizeEffectStrip(
      `burst-star-l-${i}`,
      "burst",
      buildTaperedRibbonPolygon([prevValley, tip], edgeWidth, 0.2, "outward", 0.9),
      [prevValley, tip],
      edgeWidth,
      opacity,
      clipFrame,
    );
    if (leftStrip) strips.push(leftStrip);
    const rightStrip = finalizeEffectStrip(
      `burst-star-r-${i}`,
      "burst",
      buildTaperedRibbonPolygon([nextValley, tip], edgeWidth, 0.2, "outward", 0.9),
      [nextValley, tip],
      edgeWidth,
      opacity,
      clipFrame,
    );
    if (rightStrip) strips.push(rightStrip);
  }

  if (style === "star-plus-rays") {
    const rayCount = Math.round(clampEffectNumber(options.secondaryRayCount ?? spikes, 4, 160));
    for (let i = 0; i < rayCount; i += 1) {
      const theta = rotRad + ((i + 0.25) / rayCount) * TAU + (random() * 2 - 1) * 0.04;
      const rIn = Math.hypot(Math.cos(theta) * rx, Math.sin(theta) * ry) * (0.95 + random() * 0.35);
      const rOut = outerR * (1.05 + random() * 0.45);
      const p0: Point2D = { x: options.center.x + Math.cos(theta) * rIn, y: options.center.y + Math.sin(theta) * rIn };
      const p1: Point2D = { x: options.center.x + Math.cos(theta) * rOut, y: options.center.y + Math.sin(theta) * rOut };
      const rayWidth = Math.max(0.6, baseWidth * (0.45 + random() * 0.7));
      const strip = finalizeEffectStrip(
        `burst-ray-${i}`,
        "burst",
        buildTaperedRibbonPolygon([p0, p1], rayWidth, 0, "inward", 1.15),
        [p0, p1],
        rayWidth,
        opacity,
        clipFrame,
      );
      if (strip) strips.push(strip);
    }
  }

  return finalizeEffectResult("burst", seed, strips, clipFrame);
}

/** 통합 효과선 생성 진입점. */
export function generateProceduralEffectLines(config: ProceduralEffectLineConfig): ProceduralEffectLineResult {
  switch (config.kind) {
    case "concentration":
      return generateConcentrationEffectLines(config);
    case "speed":
      return generateSpeedEffectLines(config);
    case "flow":
      return generateFlowEffectLines(config);
    case "burst":
      return generateBurstEffectLines(config);
  }
}

/** 웹툰 작화용 기본 절차적 효과선 프리셋 4종. */
export const PROCEDURAL_EFFECT_LINE_PRESETS: readonly ProceduralEffectLinePreset[] = [
  {
    id: "climax-focus-ellipse",
    label: "클라이맥스 타원 집중선",
    description: "불균일 뭉침 간격과 안쪽 날카로운 테이퍼를 적용한 임팩트 집중선",
    config: {
      kind: "concentration",
      seed: 20261122,
      center: { x: 180, y: 120 },
      innerRadiusX: 54,
      innerRadiusY: 42,
      ellipseRotationDeg: -8,
      outerRadius: 210,
      lineCount: 54,
      baseWidth: 2.6,
      widthJitter: 0.45,
      angleJitterDeg: 2.4,
      innerRadiusJitter: 0.24,
      lengthJitter: 0.12,
      unevenSpacing: 0.48,
      clusterCount: 6,
      taperMode: "inward",
      clipFrame: { kind: "rect", x: 12, y: 12, width: 336, height: 216 },
    },
  },
  {
    id: "dash-diagonal-speed",
    label: "사선 파선 스피드선",
    description: "임의 각도·가변 굵기·파선 분할로 질주감을 강조하는 액션 스피드선",
    config: {
      kind: "speed",
      seed: 20261123,
      center: { x: 180, y: 120 },
      angleDeg: -22,
      spanWidth: 210,
      length: 340,
      lineCount: 28,
      minWidth: 0.9,
      maxWidth: 3.4,
      unevenSpacing: 0.4,
      positionJitter: 36,
      lengthJitter: 0.25,
      taperMode: "both",
      dashEnabled: true,
      dashLength: 62,
      gapLength: 24,
      dashJitter: 0.3,
      clipFrame: { kind: "rect", x: 12, y: 12, width: 336, height: 216 },
    },
  },
  {
    id: "bezier-sword-flow",
    label: "베지어 궤적 유선",
    description: "검격·회피 동선을 따라 휘어지며 양끝이 뾰족하게 빠지는 베지어 유선",
    config: {
      kind: "flow",
      seed: 20261124,
      curve: [
        { x: 24, y: 196 },
        { x: 112, y: 36 },
        { x: 246, y: 204 },
        { x: 338, y: 48 },
      ],
      lineCount: 18,
      bandWidth: 76,
      minWidth: 0.8,
      maxWidth: 3.0,
      samplesPerLine: 22,
      unevenSpacing: 0.35,
      offsetJitter: 0.25,
      trimJitter: 0.14,
      taperMode: "both",
      clipFrame: { kind: "rect", x: 12, y: 12, width: 336, height: 216 },
    },
  },
  {
    id: "impact-star-burst",
    label: "컷 클리핑 폭발 충격파",
    description: "별형 충격파와 파열 방사선을 컷 프레임 경계에 맞춰 절단한 폭발선",
    config: {
      kind: "burst",
      seed: 20261125,
      center: { x: 180, y: 120 },
      innerRadiusX: 44,
      innerRadiusY: 36,
      outerRadius: 175,
      spikeCount: 20,
      spikeJitter: 0.32,
      rotationDeg: 12,
      burstStyle: "star-plus-rays",
      baseWidth: 3.0,
      secondaryRayCount: 28,
      clipFrame: { kind: "rect", x: 12, y: 12, width: 336, height: 216 },
    },
  },
] as const;
