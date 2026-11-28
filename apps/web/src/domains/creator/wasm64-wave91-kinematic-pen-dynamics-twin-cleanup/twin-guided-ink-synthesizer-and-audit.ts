/**
 * 작가 디지털 트윈 기반 가변 선폭 펜선 리본 합성기 · 인쇄 안전 비교 SVG 렌더러 · 한국어 요약기.
 *
 * - 통합된 중심선에 작가 고유의 진입 어택, 속도-곡률 필압 곡선, 모서리 미세 체류(micro-dwell),
 *   틸트 비등방성, 진출 플릭 테이퍼를 재합성해 좌/우 닫힌 가변 선폭 벡터 리본을 생성한다.
 * - 인쇄 안전 고대비 비교 SVG(오버레이 / 나란히 보기)와 번역투 없는 자연스러운 한국어 요약을 출력한다.
 */

import {
  LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT,
  clampNumber,
  computeInkDnaSimilarityScore,
  computeMean,
  evaluatePressureTransferModel,
  type ArtistPenDynamicsTwinProfile,
  type InkDnaSimilarityBreakdown,
  type KinematicPrivacyContract,
  type Point2D,
  type StylusKinematicStroke,
  type StylusSamplePoint,
} from "./artist-kinematic-pen-twin-profiler";
import {
  consolidateRoughSketchStrokes,
  type ConsolidatedSpineStroke,
  type RoughConsolidationOptions,
  type RoughConsolidationResult,
} from "./multi-stroke-rough-consolidator";

export type KinematicCleanupMode = "consolidate-rough" | "single-stroke-denoise";

export interface SynthesizedInkSample {
  readonly x: number;
  readonly y: number;
  readonly arcLengthPx: number;
  readonly normalizedArc: number;
  readonly pressure: number;
  readonly widthPx: number;
  readonly speedPxPerSec: number;
  readonly signedCurvature: number;
  readonly isCornerCusp: boolean;
}

export interface SynthesizedInkRibbonStroke {
  readonly id: string;
  readonly sourceStrokeIds: readonly string[];
  readonly centerPoints: readonly SynthesizedInkSample[];
  readonly leftOutline: readonly Point2D[];
  readonly rightOutline: readonly Point2D[];
  readonly closedPolygon: readonly Point2D[];
  readonly widthPx: readonly number[];
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly meanWidthPx: number;
  readonly cornerIndices: readonly number[];
  readonly kinematicStroke: StylusKinematicStroke;
}

export interface KinematicCleanupOptions {
  readonly mode?: KinematicCleanupMode;
  readonly consolidation?: RoughConsolidationOptions;
  readonly widthScale?: number;
  readonly tiltAngleRad?: number;
  readonly minTipWidthPx?: number;
}

export interface KinematicCleanupAuditSummary {
  readonly hasNonFiniteValues: boolean;
  readonly totalRibbonVertices: number;
  readonly meanInkWidthPx: number;
}

export interface KinematicInkCleanupResult {
  readonly artistId: string;
  readonly profileName: string;
  readonly profileFingerprintHex: string;
  readonly mode: KinematicCleanupMode;
  readonly inputRoughStrokes: readonly StylusKinematicStroke[];
  readonly consolidation: RoughConsolidationResult;
  readonly inkStrokes: readonly SynthesizedInkRibbonStroke[];
  readonly inkDnaSimilarity: InkDnaSimilarityBreakdown;
  readonly privacyContract: KinematicPrivacyContract;
  readonly audit: KinematicCleanupAuditSummary;
}

export interface RenderCleanupSvgOptions {
  readonly layout?: "overlay" | "side-by-side";
  readonly paddingPx?: number;
  readonly title?: string;
  readonly showCornerMarkers?: boolean;
}

const SVG_PAPER_BG = "#FAF8F3";
const SVG_FRAME_BORDER = "#D6D1C4";
const SVG_ROUGH_BLUE = "#5B9BD5";
const SVG_INK_DARK = "#141619";
const SVG_CORNER_ACCENT = "#1F4435";
const SVG_TEXT_MUTED = "#3F4742";
const MITER_LIMIT = 2.2;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clampNumber(t, 0, 1);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function formatSvgNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function nearestCornerArcDistance(
  arcPos: number,
  cornerArcs: readonly number[],
): number {
  let minDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cornerArcs.length; i += 1) {
    const ca = cornerArcs[i];
    if (ca === undefined) continue;
    const d = Math.abs(arcPos - ca);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function synthesizeRibbonForSpine(
  spine: ConsolidatedSpineStroke,
  twinProfile: ArtistPenDynamicsTwinProfile,
  widthScale: number,
  tiltAngleRad: number,
  minTipWidthPx: number,
): SynthesizedInkRibbonStroke {
  const pts = spine.points;
  const n = pts.length;
  const cornerArcs = spine.cornerIndices
    .map((idx) => pts[idx]?.arcLengthPx)
    .filter((v): v is number => v !== undefined);

  const entryFrac = clampNumber(twinProfile.entryRampFraction, 0.015, 0.45);
  const exitFrac = clampNumber(twinProfile.exitTaperFraction, 0.015, 0.45);
  const exitExp = clampNumber(twinProfile.exitTaperExponent, 0.25, 4.0);
  const baseSpeed = Math.max(40, twinProfile.typicalMeanSpeedPxPerSec);
  const bodyRefP = Math.max(
    0.15,
    evaluatePressureTransferModel(
      twinProfile.pressureModel,
      baseSpeed,
      twinProfile.typicalAbsCurvature,
    ),
  );
  const tiltCos = Math.cos(tiltAngleRad);
  const tiltSin = Math.sin(tiltAngleRad);
  const tiltMag = clampNumber(0.18 + twinProfile.tiltWidthAnisotropy * 0.75, 0.05, 0.9);

  const centerPoints: SynthesizedInkSample[] = [];
  const widths: number[] = [];
  const stylusPoints: StylusSamplePoint[] = [];
  let currentTimeMs = 0;

  for (let i = 0; i < n; i += 1) {
    const sp = pts[i];
    if (!sp) continue;
    const u = sp.normalizedArc;
    const absK = Math.abs(sp.signedCurvature);

    // 1) 작가 속도 운동학 재합성 (곡률 감속 + 모서리 감속 + 진출 플릭 가속)
    let speed = baseSpeed / (1 + 10 * absK);
    const cornerDist = nearestCornerArcDistance(sp.arcLengthPx, cornerArcs);
    if (Number.isFinite(cornerDist) && cornerDist < 10) {
      const slowFactor = lerp(0.55, 1.0, cornerDist / 10);
      speed *= slowFactor;
    }
    if (u > 1 - exitFrac) {
      const tOut = clampNumber((u - (1 - exitFrac)) / exitFrac, 0, 1);
      speed *= lerp(1.0, twinProfile.exitFlickVelocityRatio, tOut);
    }
    speed = Math.max(25, speed);

    if (i > 0) {
      const prev = pts[i - 1];
      const ds = prev ? Math.max(0.01, sp.arcLengthPx - prev.arcLengthPx) : 1;
      currentTimeMs += (ds / speed) * 1000;
    }

    // 2) 작가 필압 전달 모델 + 모서리 미세 체류 + 진입/진출 포락선
    const modelPressure = evaluatePressureTransferModel(
      twinProfile.pressureModel,
      speed,
      absK,
    );
    let pressure = modelPressure;

    if (Number.isFinite(cornerDist) && cornerDist < 6) {
      const dwellWeight = Math.exp(-((cornerDist / 2.8) ** 2));
      pressure = clampNumber(
        pressure + twinProfile.cornerMicroDwellBoost * dwellWeight,
        twinProfile.pressureModel.minPressure,
        twinProfile.pressureModel.maxPressure,
      );
    }

    if (u < entryFrac) {
      const tIn = clampNumber(u / entryFrac, 0, 1);
      const attackPower = clampNumber(twinProfile.entryAttackSlope / 3.2, 0.75, 2.8);
      const envIn = 1 - Math.pow(1 - tIn, attackPower);
      pressure = lerp(twinProfile.entryInitialPressure, pressure, envIn);
    } else if (u > 1 - exitFrac) {
      const tRemain = clampNumber((1 - u) / exitFrac, 0, 1);
      const envOut = Math.pow(tRemain, exitExp);
      pressure = lerp(twinProfile.exitTerminalPressure, pressure, envOut);
    }
    pressure = clampNumber(pressure, 0.02, 1.0);

    // 3) 틸트 비등방성 반영 가변 선폭 산출
    const sinTiltCross = Math.abs(sp.tangentX * tiltSin - sp.tangentY * tiltCos);
    const anisoFactor =
      1 + twinProfile.tiltWidthAnisotropy * (sinTiltCross - 0.5) * 0.55;
    const pressureRatio = pressure / bodyRefP;
    const rawWidth = twinProfile.nominalWidthPx.typical * pressureRatio * anisoFactor;
    const maxAllowed = Math.max(
      minTipWidthPx,
      twinProfile.nominalWidthPx.max * 1.35 * widthScale,
    );
    const width = clampNumber(rawWidth * widthScale, minTipWidthPx, maxAllowed);

    widths.push(width);
    centerPoints.push({
      x: sp.x,
      y: sp.y,
      arcLengthPx: sp.arcLengthPx,
      normalizedArc: u,
      pressure,
      widthPx: width,
      speedPxPerSec: speed,
      signedCurvature: sp.signedCurvature,
      isCornerCusp: sp.isCornerCusp,
    });
    stylusPoints.push({
      x: sp.x,
      y: sp.y,
      pressure,
      tiltX: tiltCos * tiltMag,
      tiltY: tiltSin * tiltMag,
      timestampMs: currentTimeMs,
    });
  }

  // 4) 좌/우 닫힌 펜선 리본 윤곽(모서리 마이터 제한 적용)
  const leftOutline: Point2D[] = [];
  const rightOutline: Point2D[] = [];
  for (let i = 0; i < n; i += 1) {
    const sp = pts[i];
    if (!sp) continue;
    const halfW = (widths[i] ?? minTipWidthPx) * 0.5;
    let offsetX = -sp.tangentY * halfW;
    let offsetY = sp.tangentX * halfW;

    if (sp.isCornerCusp && i > 0 && i < n - 1) {
      const prev = pts[i - 1];
      const next = pts[i + 1];
      if (prev && next) {
        const inDx = sp.x - prev.x;
        const inDy = sp.y - prev.y;
        const inLen = Math.hypot(inDx, inDy);
        const outDx = next.x - sp.x;
        const outDy = next.y - sp.y;
        const outLen = Math.hypot(outDx, outDy);
        if (inLen > 1e-6 && outLen > 1e-6) {
          const nInX = -inDy / inLen;
          const nInY = inDx / inLen;
          const nOutX = -outDy / outLen;
          const nOutY = outDx / outLen;
          const bx = nInX + nOutX;
          const by = nInY + nOutY;
          const bLen = Math.hypot(bx, by);
          if (bLen > 1e-6) {
            const mx = bx / bLen;
            const my = by / bLen;
            const dot = Math.max(1 / MITER_LIMIT, mx * nInX + my * nInY);
            const miterLen = Math.min(halfW * MITER_LIMIT, halfW / dot);
            offsetX = mx * miterLen;
            offsetY = my * miterLen;
          }
        }
      }
    }

    leftOutline.push({ x: sp.x + offsetX, y: sp.y + offsetY });
    rightOutline.push({ x: sp.x - offsetX, y: sp.y - offsetY });
  }

  const closedPolygon: Point2D[] = [
    ...leftOutline,
    ...[...rightOutline].reverse(),
  ];

  let minW = Number.POSITIVE_INFINITY;
  let maxW = 0;
  for (let i = 0; i < widths.length; i += 1) {
    const w = widths[i];
    if (w === undefined) continue;
    if (w < minW) minW = w;
    if (w > maxW) maxW = w;
  }
  const safeMinW = Number.isFinite(minW) ? minW : 0;

  return {
    id: `ink-${spine.id}`,
    sourceStrokeIds: [...spine.sourceStrokeIds],
    centerPoints,
    leftOutline,
    rightOutline,
    closedPolygon,
    widthPx: widths,
    minWidthPx: Number(safeMinW.toFixed(3)),
    maxWidthPx: Number(maxW.toFixed(3)),
    meanWidthPx: Number(computeMean(widths).toFixed(3)),
    cornerIndices: [...spine.cornerIndices],
    kinematicStroke: {
      id: `ink-${spine.id}`,
      points: stylusPoints,
      toolHint:
        twinProfile.presetKind === "brushpen-calligraphy"
          ? "brushpen"
          : twinProfile.presetKind === "seinen-marupen-crisp"
            ? "marupen"
            : "gpen",
      baseWidthPx: twinProfile.nominalWidthPx.typical,
    },
  };
}

export function synthesizeCleanInkWithArtistTwin(
  roughStrokes: readonly StylusKinematicStroke[],
  twinProfile: ArtistPenDynamicsTwinProfile,
  options?: KinematicCleanupOptions,
): KinematicInkCleanupResult {
  const mode: KinematicCleanupMode = options?.mode ?? "consolidate-rough";
  const widthScale = clampNumber(options?.widthScale ?? 1.0, 0.25, 4.0);
  const tiltAngleRad = Number.isFinite(options?.tiltAngleRad)
    ? (options?.tiltAngleRad ?? Math.PI / 4)
    : Math.PI / 4;
  const minTipWidthPx = clampNumber(options?.minTipWidthPx ?? 0.25, 0.1, 4.0);

  const consolidation = consolidateRoughSketchStrokes(roughStrokes, {
    ...options?.consolidation,
    preserveSingleStrokeMode:
      mode === "single-stroke-denoise"
        ? true
        : (options?.consolidation?.preserveSingleStrokeMode ?? false),
  });

  const inkStrokes = consolidation.spines.map((spine) =>
    synthesizeRibbonForSpine(
      spine,
      twinProfile,
      widthScale,
      tiltAngleRad,
      minTipWidthPx,
    ),
  );

  const inkDnaSimilarity = computeInkDnaSimilarityScore(
    inkStrokes.map((s) => s.kinematicStroke),
    twinProfile,
  );

  let hasNonFiniteValues = false;
  let totalRibbonVertices = 0;
  const meanWidths: number[] = [];

  for (let i = 0; i < inkStrokes.length; i += 1) {
    const stroke = inkStrokes[i];
    if (!stroke) continue;
    totalRibbonVertices += stroke.closedPolygon.length;
    meanWidths.push(stroke.meanWidthPx);
    for (let j = 0; j < stroke.closedPolygon.length; j += 1) {
      const pt = stroke.closedPolygon[j];
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        hasNonFiniteValues = true;
      }
    }
    for (let j = 0; j < stroke.widthPx.length; j += 1) {
      const w = stroke.widthPx[j];
      if (w === undefined || !Number.isFinite(w) || w < 0) {
        hasNonFiniteValues = true;
      }
    }
  }

  return {
    artistId: twinProfile.artistId,
    profileName: twinProfile.profileName,
    profileFingerprintHex: twinProfile.profileFingerprintHex,
    mode,
    inputRoughStrokes: roughStrokes,
    consolidation,
    inkStrokes,
    inkDnaSimilarity,
    privacyContract: LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT,
    audit: {
      hasNonFiniteValues,
      totalRibbonVertices,
      meanInkWidthPx: Number(computeMean(meanWidths).toFixed(3)),
    },
  };
}

function computeCleanupBounds(result: KinematicInkCleanupResult): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const expand = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (let i = 0; i < result.inputRoughStrokes.length; i += 1) {
    const pts = result.inputRoughStrokes[i]?.points ?? [];
    for (let j = 0; j < pts.length; j += 1) {
      const p = pts[j];
      if (p) expand(p.x, p.y);
    }
  }
  for (let i = 0; i < result.inkStrokes.length; i += 1) {
    const poly = result.inkStrokes[i]?.closedPolygon ?? [];
    for (let j = 0; j < poly.length; j += 1) {
      const p = poly[j];
      if (p) expand(p.x, p.y);
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 280, maxY: 160 };
  }
  return { minX, minY, maxX, maxY };
}

function buildPolylinePathD(points: readonly Point2D[]): string {
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const cmd = parts.length === 0 ? "M" : "L";
    parts.push(`${cmd} ${formatSvgNum(p.x)} ${formatSvgNum(p.y)}`);
  }
  return parts.join(" ");
}

export function renderKinematicCleanupComparisonSvg(
  result: KinematicInkCleanupResult,
  options?: RenderCleanupSvgOptions,
): string {
  const layout = options?.layout ?? "overlay";
  const paddingPx = clampNumber(options?.paddingPx ?? 24, 8, 96);
  const showCornerMarkers = options?.showCornerMarkers ?? true;
  const headerHeight = 28;
  const bounds = computeCleanupBounds(result);
  const contentW = Math.max(120, bounds.maxX - bounds.minX);
  const contentH = Math.max(80, bounds.maxY - bounds.minY);
  const panelW = contentW + paddingPx * 2;
  const panelH = contentH + paddingPx * 2;
  const gapPx = layout === "side-by-side" ? 16 : 0;
  const totalW = layout === "side-by-side" ? panelW * 2 + gapPx : panelW;
  const totalH = headerHeight + panelH;

  const originOffsetX = paddingPx - bounds.minX;
  const originOffsetY = headerHeight + paddingPx - bounds.minY;
  const inkTranslateX =
    layout === "side-by-side" ? originOffsetX + panelW + gapPx : originOffsetX;

  const roughPaths: string[] = [];
  for (let i = 0; i < result.inputRoughStrokes.length; i += 1) {
    const stroke = result.inputRoughStrokes[i];
    if (!stroke || stroke.points.length < 2) continue;
    const d = buildPolylinePathD(stroke.points);
    if (!d) continue;
    roughPaths.push(
      `      <path id="rough-${escapeXml(stroke.id)}" d="${d}" fill="none" stroke="${SVG_ROUGH_BLUE}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" opacity="0.6" />`,
    );
  }

  const inkPolygons: string[] = [];
  const cornerMarks: string[] = [];
  for (let i = 0; i < result.inkStrokes.length; i += 1) {
    const stroke = result.inkStrokes[i];
    if (!stroke || stroke.closedPolygon.length < 3) continue;
    const d = `${buildPolylinePathD(stroke.closedPolygon)} Z`;
    inkPolygons.push(
      `      <path id="${escapeXml(stroke.id)}" d="${d}" fill="${SVG_INK_DARK}" stroke="none" />`,
    );
    if (showCornerMarkers) {
      for (let c = 0; c < stroke.cornerIndices.length; c += 1) {
        const idx = stroke.cornerIndices[c];
        const pt = idx !== undefined ? stroke.centerPoints[idx] : undefined;
        if (pt) {
          cornerMarks.push(
            `      <circle cx="${formatSvgNum(pt.x)}" cy="${formatSvgNum(pt.y)}" r="2.8" fill="none" stroke="${SVG_CORNER_ACCENT}" stroke-width="1.1" />`,
          );
        }
      }
    }
  }

  const titleText =
    options?.title ??
    `${result.profileName} · DNA ${formatSvgNum(result.inkDnaSimilarity.overallScore)}/100`;
  const escapedTitle = escapeXml(titleText);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatSvgNum(totalW)} ${formatSvgNum(totalH)}" width="${formatSvgNum(totalW)}" height="${formatSvgNum(totalH)}" role="img" aria-label="${escapedTitle}" data-layout="${escapeXml(layout)}" data-fingerprint="${escapeXml(result.profileFingerprintHex)}">`,
    `  <title>${escapedTitle}</title>`,
    `  <rect x="0" y="0" width="${formatSvgNum(totalW)}" height="${formatSvgNum(totalH)}" fill="${SVG_PAPER_BG}" stroke="${SVG_FRAME_BORDER}" stroke-width="1" />`,
    `  <text x="12" y="18" font-family="sans-serif" font-size="11" font-weight="600" fill="${SVG_TEXT_MUTED}">${escapedTitle}</text>`,
  ];

  if (layout === "side-by-side") {
    const splitX = panelW + gapPx * 0.5;
    lines.push(
      `  <line x1="${formatSvgNum(splitX)}" y1="${formatSvgNum(headerHeight)}" x2="${formatSvgNum(splitX)}" y2="${formatSvgNum(totalH)}" stroke="${SVG_FRAME_BORDER}" stroke-width="1" stroke-dasharray="4 3" />`,
      `  <text x="12" y="${formatSvgNum(headerHeight + 14)}" font-family="sans-serif" font-size="10" fill="${SVG_ROUGH_BLUE}">러프 스케치 (${String(result.consolidation.metrics.inputStrokeCount)}획)</text>`,
      `  <text x="${formatSvgNum(panelW + gapPx + 12)}" y="${formatSvgNum(headerHeight + 14)}" font-family="sans-serif" font-size="10" fill="${SVG_INK_DARK}">디지털 트윈 펜선 (${String(result.consolidation.metrics.consolidatedStrokeCount)}획)</text>`,
    );
  }

  lines.push(
    `  <g data-layer="rough-sketch" transform="translate(${formatSvgNum(originOffsetX)} ${formatSvgNum(originOffsetY)})">`,
    ...roughPaths,
    `  </g>`,
    `  <g data-layer="synthesized-ink" transform="translate(${formatSvgNum(inkTranslateX)} ${formatSvgNum(originOffsetY)})">`,
    ...inkPolygons,
    `  </g>`,
  );

  if (cornerMarks.length > 0) {
    lines.push(
      `  <g data-layer="preserved-corners" transform="translate(${formatSvgNum(inkTranslateX)} ${formatSvgNum(originOffsetY)})">`,
      ...cornerMarks,
      `  </g>`,
    );
  }

  lines.push("</svg>");
  return lines.join("\n");
}

export function summarizeKinematicCleanupKo(
  result: KinematicInkCleanupResult,
): string {
  const m = result.consolidation.metrics;
  const reductionPct = (m.strokeReductionRatio * 100).toFixed(1);
  const tremorPct = (m.tremorReductionRatio * 100).toFixed(1);
  const hausdorffStr = m.meanHausdorffPx.toFixed(2);
  const dnaStr = result.inkDnaSimilarity.overallScore.toFixed(1);
  const privacyText =
    result.privacyContract.runsLocallyOnly &&
    !result.privacyContract.uploadsRawStrokes &&
    !result.privacyContract.usesExternalCloud
      ? "모든 계산은 기기 안에서만 실행되며 원본 러프 획은 외부 클라우드로 전송되지 않습니다."
      : "로컬 전용 개인정보 계약 확인이 필요합니다.";

  if (m.inputStrokeCount === 0 || m.consolidatedStrokeCount === 0) {
    return `[${result.profileName}] 정리할 유효한 러프 획이 없습니다. ${privacyText}`;
  }

  const cornerClause =
    m.preservedCornerCount > 0
      ? `날카로운 모서리 ${String(m.preservedCornerCount)}곳의 각도를 뭉개지 않고 살렸습니다.`
      : "전체 곡선의 자연스러운 흐름을 유지했습니다.";

  return (
    `[${result.profileName}] 러프 ${String(m.inputStrokeCount)}획을 가변 선폭 펜선 ${String(m.consolidatedStrokeCount)}획으로 정리했습니다` +
    `(획 수 ${reductionPct}% 절감, 평균 형상 오차 ${hausdorffStr}px). ` +
    `고주파 손떨림을 ${tremorPct}% 줄였고 ${cornerClause} ` +
    `작가 펜선 DNA 일치도는 ${dnaStr}/100점입니다. ` +
    privacyText
  );
}
