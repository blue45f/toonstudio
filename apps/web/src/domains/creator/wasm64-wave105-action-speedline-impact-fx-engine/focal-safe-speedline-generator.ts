/**
 * Wave 105 — 물리 기반 만화 집중선·속도선·소용돌이·플래시 베타 생성 엔진.
 *
 * - 4종 액션 VFX 필드(`radial-focus-burst`, `directional-motion-blur`,
 *   `curved-vortex-rush`, `impact-flash-beta`) 결정적 시드 기반 생성
 * - 인물 안전 타원(`subjectSafeEllipse`) + 말풍선(`balloonKeepOutBoxes`) 정밀 절삭으로 침범 0건 보장
 * - 손펜(G-pen) 유기적 각도 군집 리듬과 4사분면 균형 분포 지표 계산
 */

import {
  clampFinite,
  createSeededRng,
  doesPolygonIntrudeKeepOuts,
  intersectRayAabb,
  intersectRayEllipse,
  isPointInsideBalloonBox,
  isPointInsideSafeEllipse,
  resolveBalloonBox,
  resolvePanelBox,
  subtractForbiddenIntervals,
  type BalloonKeepOutBox,
  type PanelRect,
  type ResolvedBox,
  type SafeEllipse,
  type ScalarInterval,
  type Vec2,
} from "./speedline-keepout-geometry";
import {
  buildStraightTaperedNeedle,
  computeFieldAuditMetrics,
  generateOrganicClumpedAngles,
  TWO_PI,
  type ActionSpeedlineAuditMetrics,
  type SpeedlineFieldMode,
  type SpeedlineTier,
  type TaperedSpeedlinePolygon,
} from "./speedline-rhythm-and-metrics";

export {
  clampFinite,
  createSeededRng,
  doesPolygonIntrudeKeepOuts,
  doesSegmentIntrudeBalloonBox,
  doesSegmentIntrudeEllipse,
  intersectRayAabb,
  intersectRayEllipse,
  isPointInsideBalloonBox,
  isPointInsideSafeEllipse,
  subtractForbiddenIntervals,
  type BalloonKeepOutBox,
  type PanelRect,
  type SafeEllipse,
  type ScalarInterval,
  type Vec2,
} from "./speedline-keepout-geometry";

export type {
  ActionSpeedlineAuditMetrics,
  SpeedlineFieldMode,
  SpeedlineTier,
  TaperedSpeedlinePolygon,
} from "./speedline-rhythm-and-metrics";

export interface ActionSpeedlineSpec {
  readonly mode: SpeedlineFieldMode;
  readonly panel: PanelRect;
  readonly focalPoint?: Vec2;
  readonly subjectSafeEllipse: SafeEllipse;
  readonly balloonKeepOutBoxes?: readonly BalloonKeepOutBox[];
  readonly directionDeg?: number;
  readonly perspectiveConvergeStrength?: number;
  readonly vortexSwirlRad?: number;
  readonly lineCount?: number;
  readonly clusterCount?: number;
  readonly outerBaseWidthPx?: number;
  readonly innerArrivalJitterPx?: number;
  readonly flashRingThicknessRatio?: number;
  readonly seed?: number;
}

export interface ActionSpeedlineFieldResult {
  readonly mode: SpeedlineFieldMode;
  readonly seed: number;
  readonly panel: PanelRect;
  readonly focalPoint: Vec2;
  readonly subjectSafeEllipse: SafeEllipse;
  readonly balloonKeepOutBoxes: readonly BalloonKeepOutBox[];
  readonly directionDeg: number;
  readonly polygons: readonly TaperedSpeedlinePolygon[];
  readonly outerBetaRingPolygons: readonly (readonly Vec2[])[];
  readonly metrics: ActionSpeedlineAuditMetrics;
}

const MIN_LINE_LENGTH_PX = 12;
const CLEARANCE_SAFETY_PAD_PX = 1.35;

function buildRadialOrFlashField(
  spec: ActionSpeedlineSpec,
  panelBox: ResolvedBox,
  focal: Vec2,
  balloons: readonly BalloonKeepOutBox[],
  rng: () => number,
  seed: number,
): ActionSpeedlineFieldResult {
  const isFlash = spec.mode === "impact-flash-beta";
  const lineCount = clampFinite(spec.lineCount ?? (isFlash ? 92 : 84), 16, 360, 84);
  const clusterCount = clampFinite(spec.clusterCount ?? 16, 8, 40, 16);
  const baseWidthPx = clampFinite(spec.outerBaseWidthPx ?? (isFlash ? 9.5 : 6.2), 1.2, 48, 6.2);
  const jitterPx = clampFinite(spec.innerArrivalJitterPx ?? (isFlash ? 36 : 26), 0, 400, 26);
  const flashRatio = clampFinite(spec.flashRingThicknessRatio ?? 0.19, 0.06, 0.45, 0.19);
  const samples = generateOrganicClumpedAngles(lineCount, clusterCount, rng, isFlash);

  const polygons: TaperedSpeedlinePolygon[] = [];
  const outerBetaRingPolygons: (readonly Vec2[])[] = [];
  let balloonClippedLineCount = 0;
  let subjectCarvedLineCount = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const dir = { x: Math.cos(sample.angleRad), y: Math.sin(sample.angleRad) };
    const perp = { x: -dir.y, y: dir.x };
    const panelHit = intersectRayAabb(focal, dir, panelBox.minX, panelBox.minY, panelBox.maxX, panelBox.maxY);
    if (!panelHit || panelHit.end <= 0) continue;

    const rayStart = Math.max(0, panelHit.start);
    const rayEnd = panelHit.end;
    const widthPx = baseWidthPx * sample.widthScale;
    const safePad = widthPx * 0.5 + CLEARANCE_SAFETY_PAD_PX;
    const forbidden: ScalarInterval[] = [];

    const subjHit = intersectRayEllipse(focal, dir, spec.subjectSafeEllipse, safePad);
    if (subjHit && subjHit.end > rayStart) {
      forbidden.push({ start: Math.max(rayStart, subjHit.start), end: Math.min(rayEnd, subjHit.end) });
      subjectCarvedLineCount += 1;
    }

    let hitBalloon = false;
    for (const box of balloons) {
      const b = resolveBalloonBox(box, safePad);
      if (!b) continue;
      const bHit = intersectRayAabb(focal, dir, b.minX, b.minY, b.maxX, b.maxY);
      if (bHit && bHit.end > rayStart && bHit.start < rayEnd) {
        forbidden.push({ start: Math.max(rayStart, bHit.start), end: Math.min(rayEnd, bHit.end) });
        hitBalloon = true;
      }
    }
    if (hitBalloon) balloonClippedLineCount += 1;

    const validIntervals = subtractForbiddenIntervals({ start: rayStart, end: rayEnd }, forbidden);
    let chosen: ScalarInterval | null = null;
    for (let idx = validIntervals.length - 1; idx >= 0; idx -= 1) {
      if (validIntervals[idx].end - validIntervals[idx].start >= MIN_LINE_LENGTH_PX) {
        chosen = validIntervals[idx];
        break;
      }
    }
    if (!chosen) continue;

    const availableLen = chosen.end - chosen.start;
    const jitterScale = sample.tier === "primary" ? sample.jitterScale * 0.6 : 0.25 + sample.jitterScale * 0.75;
    const tTip = chosen.start + Math.min(availableLen * 0.48, jitterPx * jitterScale);
    const tBase = chosen.end;
    if (tBase - tTip < MIN_LINE_LENGTH_PX) continue;

    const tip = { x: focal.x + dir.x * tTip, y: focal.y + dir.y * tTip };
    const baseCenter = { x: focal.x + dir.x * tBase, y: focal.y + dir.y * tBase };
    const verts = buildStraightTaperedNeedle(tip, baseCenter, perp, widthPx);
    if (doesPolygonIntrudeKeepOuts(verts, spec.subjectSafeEllipse, balloons)) continue;

    polygons.push({
      id: `${spec.mode}-${i}`,
      tier: sample.tier,
      mode: spec.mode,
      angleRad: sample.angleRad,
      clusterIndex: sample.clusterIndex,
      outerBaseWidthPx: widthPx,
      tipWidthPx: 0,
      startPoint: tip,
      endPoint: baseCenter,
      lengthPx: tBase - tTip,
      vertices: verts,
      opacity: sample.tier === "secondary" ? 0.86 : 1,
    });
  }

  if (isFlash && samples.length >= 8) {
    for (let i = 0; i < samples.length; i += 1) {
      const a0 = samples[i].angleRad;
      const a1 = i + 1 < samples.length ? samples[i + 1].angleRad : samples[0].angleRad + TWO_PI;
      const d0 = { x: Math.cos(a0), y: Math.sin(a0) };
      const d1 = { x: Math.cos(a1), y: Math.sin(a1) };
      const h0 = intersectRayAabb(focal, d0, panelBox.minX, panelBox.minY, panelBox.maxX, panelBox.maxY);
      const h1 = intersectRayAabb(focal, d1, panelBox.minX, panelBox.minY, panelBox.maxX, panelBox.maxY);
      if (!h0 || !h1 || h0.end <= 0 || h1.end <= 0) continue;

      const inner0 = h0.end * (1 - flashRatio * (0.72 + (i % 3) * 0.14));
      const inner1 = h1.end * (1 - flashRatio * (0.72 + ((i + 1) % 3) * 0.14));
      const quad: readonly Vec2[] = [
        { x: focal.x + d0.x * inner0, y: focal.y + d0.y * inner0 },
        { x: focal.x + d0.x * h0.end, y: focal.y + d0.y * h0.end },
        { x: focal.x + d1.x * h1.end, y: focal.y + d1.y * h1.end },
        { x: focal.x + d1.x * inner1, y: focal.y + d1.y * inner1 },
      ];
      if (!doesPolygonIntrudeKeepOuts(quad, spec.subjectSafeEllipse, balloons)) {
        outerBetaRingPolygons.push(quad);
      }
    }
  }

  const metrics = computeFieldAuditMetrics(
    spec.mode,
    polygons,
    outerBetaRingPolygons,
    spec.subjectSafeEllipse,
    balloons,
    balloonClippedLineCount,
    subjectCarvedLineCount,
    0,
  );
  return {
    mode: spec.mode,
    seed,
    panel: spec.panel,
    focalPoint: focal,
    subjectSafeEllipse: spec.subjectSafeEllipse,
    balloonKeepOutBoxes: balloons,
    directionDeg: clampFinite(spec.directionDeg ?? 0, -360, 360, 0),
    polygons,
    outerBetaRingPolygons,
    metrics,
  };
}

function buildDirectionalField(
  spec: ActionSpeedlineSpec,
  panelBox: ResolvedBox,
  focal: Vec2,
  balloons: readonly BalloonKeepOutBox[],
  rng: () => number,
  seed: number,
): ActionSpeedlineFieldResult {
  const directionDeg = clampFinite(spec.directionDeg ?? 0, -360, 360, 0);
  const directionRad = (directionDeg * Math.PI) / 180;
  const baseDir = { x: Math.cos(directionRad), y: Math.sin(directionRad) };
  const basePerp = { x: -baseDir.y, y: baseDir.x };
  const convergeStrength = clampFinite(spec.perspectiveConvergeStrength ?? 0, 0, 0.45, 0);
  const lineCount = clampFinite(spec.lineCount ?? 60, 12, 320, 60);
  const clusterCount = clampFinite(spec.clusterCount ?? 12, 4, 32, 12);
  const baseWidthPx = clampFinite(spec.outerBaseWidthPx ?? 5.5, 1, 40, 5.5);
  const jitterPx = clampFinite(spec.innerArrivalJitterPx ?? 32, 0, 400, 32);

  const corners: readonly Vec2[] = [
    { x: panelBox.minX, y: panelBox.minY },
    { x: panelBox.maxX, y: panelBox.minY },
    { x: panelBox.maxX, y: panelBox.maxY },
    { x: panelBox.minX, y: panelBox.maxY },
  ];
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const c of corners) {
    const s = c.x * basePerp.x + c.y * basePerp.y;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
  }

  const lateralSamples: { readonly s: number; readonly clusterIndex: number; readonly tier: SpeedlineTier; readonly widthScale: number }[] = [];
  const span = Math.max(16, sMax - sMin);
  const perCluster = Math.max(1, Math.floor(lineCount / clusterCount));
  const rem = Math.max(0, Math.round(lineCount) - perCluster * clusterCount);

  for (let c = 0; c < clusterCount; c += 1) {
    const count = perCluster + (c < rem ? 1 : 0);
    const slotCenter = sMin + ((c + 0.25 + rng() * 0.5) / clusterCount) * span;
    const tightSpread = (span / clusterCount) * 0.34;
    for (let k = 0; k < count; k += 1) {
      const centered = count <= 1 ? 0 : k / (count - 1) - 0.5;
      const s = clampFinite(slotCenter + centered * tightSpread * 2 + (rng() - 0.5) * tightSpread * 0.4, sMin + 2, sMax - 2, slotCenter);
      const isPrimary = k === Math.floor(count / 2);
      lateralSamples.push({
        s,
        clusterIndex: c,
        tier: isPrimary ? "primary" : "secondary",
        widthScale: isPrimary ? 0.9 + rng() * 0.45 : 0.32 + rng() * 0.35,
      });
    }
  }
  lateralSamples.sort((a, b) => a.s - b.s);

  const polygons: TaperedSpeedlinePolygon[] = [];
  let balloonClippedLineCount = 0;
  let subjectCarvedLineCount = 0;

  for (let i = 0; i < lateralSamples.length; i += 1) {
    const sample = lateralSamples[i];
    const normOffset = (sample.s - (sMin + sMax) * 0.5) / (span * 0.5);
    const localAngle = directionRad + normOffset * convergeStrength * 0.28;
    const dir = { x: Math.cos(localAngle), y: Math.sin(localAngle) };
    const perp = { x: -dir.y, y: dir.x };
    const origin = { x: basePerp.x * sample.s, y: basePerp.y * sample.s };

    const panelHit = intersectRayAabb(origin, dir, panelBox.minX, panelBox.minY, panelBox.maxX, panelBox.maxY);
    if (!panelHit || panelHit.end - panelHit.start < MIN_LINE_LENGTH_PX) continue;

    const widthPx = baseWidthPx * sample.widthScale;
    const safePad = widthPx * 0.5 + CLEARANCE_SAFETY_PAD_PX;
    const forbidden: ScalarInterval[] = [];

    const subjHit = intersectRayEllipse(origin, dir, spec.subjectSafeEllipse, safePad);
    if (subjHit && subjHit.end > panelHit.start && subjHit.start < panelHit.end) {
      forbidden.push({ start: Math.max(panelHit.start, subjHit.start), end: Math.min(panelHit.end, subjHit.end) });
      subjectCarvedLineCount += 1;
    }

    let hitBalloon = false;
    for (const box of balloons) {
      const b = resolveBalloonBox(box, safePad);
      if (!b) continue;
      const bHit = intersectRayAabb(origin, dir, b.minX, b.minY, b.maxX, b.maxY);
      if (bHit && bHit.end > panelHit.start && bHit.start < panelHit.end) {
        forbidden.push({ start: Math.max(panelHit.start, bHit.start), end: Math.min(panelHit.end, bHit.end) });
        hitBalloon = true;
      }
    }
    if (hitBalloon) balloonClippedLineCount += 1;

    const segments = subtractForbiddenIntervals(panelHit, forbidden);
    for (let sIdx = 0; sIdx < segments.length; sIdx += 1) {
      const seg = segments[sIdx];
      const segLen = seg.end - seg.start;
      if (segLen < MIN_LINE_LENGTH_PX) continue;
      const tBase = seg.start;
      const tTip = seg.end - Math.min(segLen * 0.35, rng() * jitterPx);
      if (tTip - tBase < MIN_LINE_LENGTH_PX) continue;

      const tip = { x: origin.x + dir.x * tTip, y: origin.y + dir.y * tTip };
      const baseCenter = { x: origin.x + dir.x * tBase, y: origin.y + dir.y * tBase };
      const verts = buildStraightTaperedNeedle(tip, baseCenter, perp, widthPx);
      if (doesPolygonIntrudeKeepOuts(verts, spec.subjectSafeEllipse, balloons)) continue;

      polygons.push({
        id: `directional-motion-blur-${i}-${sIdx}`,
        tier: sample.tier,
        mode: "directional-motion-blur",
        angleRad: localAngle,
        clusterIndex: sample.clusterIndex,
        outerBaseWidthPx: widthPx,
        tipWidthPx: 0,
        startPoint: tip,
        endPoint: baseCenter,
        lengthPx: tTip - tBase,
        vertices: verts,
        opacity: sample.tier === "primary" ? 0.96 : 0.78,
      });
    }
  }

  const metrics = computeFieldAuditMetrics(
    "directional-motion-blur",
    polygons,
    [],
    spec.subjectSafeEllipse,
    balloons,
    balloonClippedLineCount,
    subjectCarvedLineCount,
    directionDeg,
  );
  return {
    mode: "directional-motion-blur",
    seed,
    panel: spec.panel,
    focalPoint: focal,
    subjectSafeEllipse: spec.subjectSafeEllipse,
    balloonKeepOutBoxes: balloons,
    directionDeg,
    polygons,
    outerBetaRingPolygons: [],
    metrics,
  };
}

function buildCurvedVortexField(
  spec: ActionSpeedlineSpec,
  panelBox: ResolvedBox,
  focal: Vec2,
  balloons: readonly BalloonKeepOutBox[],
  rng: () => number,
  seed: number,
): ActionSpeedlineFieldResult {
  const lineCount = clampFinite(spec.lineCount ?? 76, 16, 280, 76);
  const clusterCount = clampFinite(spec.clusterCount ?? 16, 8, 36, 16);
  const baseWidthPx = clampFinite(spec.outerBaseWidthPx ?? 6.4, 1.4, 40, 6.4);
  const jitterPx = clampFinite(spec.innerArrivalJitterPx ?? 24, 0, 320, 24);
  const swirlRad = clampFinite(spec.vortexSwirlRad ?? 0.46, -1.65, 1.65, 0.46);
  const samples = generateOrganicClumpedAngles(lineCount, clusterCount, rng, false);

  const polygons: TaperedSpeedlinePolygon[] = [];
  let balloonClippedLineCount = 0;
  let subjectCarvedLineCount = 0;
  const steps = 10;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const outerDir = { x: Math.cos(sample.angleRad), y: Math.sin(sample.angleRad) };
    const panelHit = intersectRayAabb(focal, outerDir, panelBox.minX, panelBox.minY, panelBox.maxX, panelBox.maxY);
    if (!panelHit || panelHit.end <= MIN_LINE_LENGTH_PX) continue;

    const widthPx = baseWidthPx * sample.widthScale;
    const safePad = widthPx * 0.5 + CLEARANCE_SAFETY_PAD_PX + 1.2;
    const subjHit = intersectRayEllipse(focal, outerDir, spec.subjectSafeEllipse, safePad);
    let rStart = Math.max(8, panelHit.start);
    if (subjHit && subjHit.end > rStart) {
      rStart = subjHit.end + jitterPx * (0.2 + sample.jitterScale * 0.8);
      subjectCarvedLineCount += 1;
    }
    const rEnd = panelHit.end;
    if (rEnd - rStart < MIN_LINE_LENGTH_PX) continue;

    const spine: Vec2[] = [];
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps;
      const r = rStart + (rEnd - rStart) * u;
      const theta = sample.angleRad + swirlRad * Math.pow(1 - u, 1.35);
      spine.push({ x: focal.x + Math.cos(theta) * r, y: focal.y + Math.sin(theta) * r });
    }

    let clippedByBalloon = false;
    let runStart = 0;
    let bestRun: Vec2[] = [];
    for (let s = 0; s <= spine.length; s += 1) {
      const pt = s < spine.length ? spine[s] : null;
      const insidePanel =
        pt !== null && pt.x >= panelBox.minX && pt.x <= panelBox.maxX && pt.y >= panelBox.minY && pt.y <= panelBox.maxY;
      let blocked = pt === null || !insidePanel || isPointInsideSafeEllipse(pt, spec.subjectSafeEllipse, safePad);
      if (!blocked && pt !== null) {
        for (const box of balloons) {
          if (isPointInsideBalloonBox(pt, box, safePad)) {
            blocked = true;
            clippedByBalloon = true;
            break;
          }
        }
      }
      if (blocked) {
        if (s - runStart >= 3 && s - runStart >= bestRun.length) bestRun = spine.slice(runStart, s);
        runStart = s + 1;
      }
    }
    if (clippedByBalloon) balloonClippedLineCount += 1;
    if (bestRun.length < 3) continue;

    let trimmed = bestRun;
    let finalVerts: readonly Vec2[] | null = null;
    while (trimmed.length >= 3) {
      const leftRail: Vec2[] = [];
      const rightRail: Vec2[] = [];
      for (let k = 1; k < trimmed.length; k += 1) {
        const u = k / (trimmed.length - 1);
        const prev = trimmed[k - 1];
        const curr = trimmed[k];
        const next = k + 1 < trimmed.length ? trimmed[k + 1] : curr;
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const len = Math.hypot(tx, ty) || 1;
        const nx = -ty / len;
        const ny = tx / len;
        const hw = widthPx * 0.5 * Math.pow(u, 1.15);
        leftRail.push({ x: curr.x + nx * hw, y: curr.y + ny * hw });
        rightRail.push({ x: curr.x - nx * hw, y: curr.y - ny * hw });
      }
      const verts: Vec2[] = [trimmed[0], ...leftRail, ...rightRail.reverse()];
      if (!doesPolygonIntrudeKeepOuts(verts, spec.subjectSafeEllipse, balloons)) {
        finalVerts = verts;
        break;
      }
      trimmed = trimmed.slice(1);
    }

    if (!finalVerts) continue;
    const tip = trimmed[0];
    const baseCenter = trimmed[trimmed.length - 1];
    const arcLen = Math.hypot(baseCenter.x - tip.x, baseCenter.y - tip.y);
    if (arcLen < MIN_LINE_LENGTH_PX) continue;

    polygons.push({
      id: `curved-vortex-rush-${i}`,
      tier: sample.tier,
      mode: "curved-vortex-rush",
      angleRad: sample.angleRad,
      clusterIndex: sample.clusterIndex,
      outerBaseWidthPx: widthPx,
      tipWidthPx: 0,
      startPoint: tip,
      endPoint: baseCenter,
      lengthPx: arcLen,
      vertices: finalVerts,
      opacity: sample.tier === "primary" ? 0.98 : 0.82,
    });
  }

  const metrics = computeFieldAuditMetrics(
    "curved-vortex-rush",
    polygons,
    [],
    spec.subjectSafeEllipse,
    balloons,
    balloonClippedLineCount,
    subjectCarvedLineCount,
    0,
  );
  return {
    mode: "curved-vortex-rush",
    seed,
    panel: spec.panel,
    focalPoint: focal,
    subjectSafeEllipse: spec.subjectSafeEllipse,
    balloonKeepOutBoxes: balloons,
    directionDeg: clampFinite(spec.directionDeg ?? 0, -360, 360, 0),
    polygons,
    outerBetaRingPolygons: [],
    metrics,
  };
}

/**
 * 인물 안전 타원과 말풍선 금지 영역을 완벽히 회피하는 물리 기반 만화 액션 집중선·속도선을 생성한다.
 */
export function generateFocalSafeActionSpeedlines(
  spec: ActionSpeedlineSpec,
): ActionSpeedlineFieldResult {
  const seed = Number.isFinite(spec.seed) ? Math.floor(spec.seed as number) : 10501;
  const rng = createSeededRng(seed);
  const panelBox = resolvePanelBox(spec.panel);
  const balloons = spec.balloonKeepOutBoxes ?? [];
  const focal: Vec2 = spec.focalPoint
    ? {
        x: clampFinite(spec.focalPoint.x, -1e6, 1e6, spec.subjectSafeEllipse.cx),
        y: clampFinite(spec.focalPoint.y, -1e6, 1e6, spec.subjectSafeEllipse.cy),
      }
    : {
        x: clampFinite(spec.subjectSafeEllipse.cx, -1e6, 1e6, (panelBox.minX + panelBox.maxX) * 0.5),
        y: clampFinite(spec.subjectSafeEllipse.cy, -1e6, 1e6, (panelBox.minY + panelBox.maxY) * 0.5),
      };

  if (spec.mode === "directional-motion-blur") {
    return buildDirectionalField(spec, panelBox, focal, balloons, rng, seed);
  }
  if (spec.mode === "curved-vortex-rush") {
    return buildCurvedVortexField(spec, panelBox, focal, balloons, rng, seed);
  }
  return buildRadialOrFlashField(spec, panelBox, focal, balloons, rng, seed);
}
