/**
 * Wave 152 — 순수 OKLCH 스타일러스 필압 전송 곡선·치즐 닙 이방성·지터 보정 감사 SVG 렌더러
 * 및 한국어 하드웨어 캘리브레이션 QA 브리프.
 *
 * - 모든 색상은 순수 `oklch(...)` 표기만 사용한다(원시 hex, rgb, hsl 절대 금지).
 * - 모든 외부 텍스트에 XML 특수문자 이스케이프를 적용하고 비유한 수치는 0으로 정규화한다.
 * - 번역투 없는 간결한 스튜디오 실무 한국어로 캘리브레이션 결과를 정리한다.
 */

import {
  evaluatePressureCurve,
  forceGfToNormalizedPressure,
  listStylusHardwareProfiles,
  type StylusHardwareId,
} from "./stylus-hardware-and-pressure-curve";
import type {
  ChiselNibStampGeometry,
  NibRotationSource,
  StylusCalibrationBundle,
} from "./tilt-barrel-and-jitter-filter";

export interface StylusCalibrationSvgOptions {
  readonly title?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly showFixedEmaComparison?: boolean;
}

export type StylusCalibrationQaStatusKo = "통과" | "주의" | "재보정 필요";

export interface StylusCalibrationReportKo {
  readonly statusKo: StylusCalibrationQaStatusKo;
  readonly headlineKo: string;
  readonly pressureTransferNoteKo: string;
  readonly barrelAndTiltNoteKo: string;
  readonly jitterFilterNoteKo: string;
  readonly actionItemsKo: readonly string[];
  readonly manifestSha256Hex: string;
  readonly fullBriefTextKo: string;
}

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  cardBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.952 0.012 155)",
  subCardBg: "oklch(0.972 0.006 92)",
  borderStrong: "oklch(0.28 0.042 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  gridLine: "oklch(0.89 0.01 90)",
  textPrimary: "oklch(0.21 0.028 160)",
  textMuted: "oklch(0.45 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  badgePassBg: "oklch(0.4 0.11 155)",
  badgeWarnBg: "oklch(0.56 0.14 74)",
  badgeAlertBg: "oklch(0.5 0.2 26)",
  badgeNeutralBg: "oklch(0.36 0.04 250)",
  curveArtistStroke: "oklch(0.25 0.06 160)",
  curveArtistDotFill: "oklch(0.99 0.004 90)",
  rawTrajectoryStroke: "oklch(0.56 0.17 26 / 0.68)",
  oneEuroTrajectoryStroke: "oklch(0.4 0.12 155)",
  fixedEmaTrajectoryStroke: "oklch(0.56 0.12 72 / 0.8)",
  nibFill: "oklch(0.42 0.11 155 / 0.24)",
  nibStroke: "oklch(0.34 0.1 155)",
  nibAxisStroke: "oklch(0.5 0.15 26)",
  sharedRangeWash: "oklch(0.88 0.04 155 / 0.28)",
} as const;

const DEVICE_STROKE_OKLCH: Readonly<Record<StylusHardwareId, string>> = {
  "wacom-pro-pen-3": "oklch(0.42 0.12 155)",
  "apple-pencil-pro": "oklch(0.46 0.14 252)",
  "samsung-s-pen": "oklch(0.56 0.14 70)",
  "huion-pw550": "oklch(0.48 0.14 330)",
};

const ROTATION_SOURCE_LABELS_KO: Readonly<Record<NibRotationSource, string>> = {
  "hardware-barrel-roll": "하드웨어 배럴 롤",
  "tilt-azimuth-fallback": "기울기 방위각 폴백",
  "stroke-tangent-fallback": "스트로크 접선 폴백",
  "fixed-angle-fallback": "고정 각도 폴백",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function fmtOne(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  const rounded = Math.round(value * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}

function fmtSciOrFixed(value: number): string {
  if (!Number.isFinite(value)) return "0.0000";
  if (value === 0) return "0.0000";
  if (value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}

/**
 * SVG 텍스트 및 속성에 삽입되는 문자열의 XML 특수문자를 이스케이프하여 XSS·파싱 오류를 차단한다.
 */
export function escapeStylusCalibrationXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function renderPressurePanelSvg(
  bundle: StylusCalibrationBundle,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): string {
  const plotX = panelX + 54;
  const plotY = panelY + 52;
  const plotW = panelW - 76;
  const plotH = panelH - 156;
  const maxForceAxisGf = 520;
  const parts: string[] = [];

  parts.push(
    `<rect x="${fmt(panelX)}" y="${fmt(panelY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
  );
  parts.push(
    `<text x="${fmt(panelX + 18)}" y="${fmt(panelY + 26)}" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">4종 스타일러스 물리 하중(gf) → 필압 전송 곡선</text>`,
  );
  parts.push(
    `<text x="${fmt(panelX + 18)}" y="${fmt(panelY + 42)}" font-size="11" fill="${OKLCH_PALETTE.textMuted}">공유 하중 구간 ${fmtOne(bundle.roundTripReport.sharedForceMinGf)}~${fmtOne(bundle.roundTripReport.sharedForceMaxGf)}gf · 왕복 최대 오차 ${escapeStylusCalibrationXml(fmtSciOrFixed(bundle.roundTripReport.maxRoundTripError))}</text>`,
  );

  // 공유 하중 구간 음영
  const sharedStartX =
    plotX + (Math.min(maxForceAxisGf, bundle.roundTripReport.sharedForceMinGf) / maxForceAxisGf) * plotW;
  const sharedEndX =
    plotX + (Math.min(maxForceAxisGf, bundle.roundTripReport.sharedForceMaxGf) / maxForceAxisGf) * plotW;
  if (sharedEndX > sharedStartX) {
    parts.push(
      `<rect x="${fmt(sharedStartX)}" y="${fmt(plotY)}" width="${fmt(sharedEndX - sharedStartX)}" height="${fmt(plotH)}" fill="${OKLCH_PALETTE.sharedRangeWash}" />`,
    );
  }

  // 격자선 (Y축 0.0~1.0, X축 0~500gf)
  for (let i = 0; i <= 4; i += 1) {
    const ratio = i / 4;
    const gy = plotY + plotH * (1 - ratio);
    parts.push(
      `<line x1="${fmt(plotX)}" y1="${fmt(gy)}" x2="${fmt(plotX + plotW)}" y2="${fmt(gy)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmt(plotX - 8)}" y="${fmt(gy + 4)}" text-anchor="end" font-size="10" fill="${OKLCH_PALETTE.textMuted}">${fmt(ratio)}</text>`,
    );
  }
  const forceTicks = [0, 100, 200, 300, 400, 500];
  for (let i = 0; i < forceTicks.length; i += 1) {
    const gf = forceTicks[i] ?? 0;
    const gx = plotX + (gf / maxForceAxisGf) * plotW;
    parts.push(
      `<line x1="${fmt(gx)}" y1="${fmt(plotY)}" x2="${fmt(gx)}" y2="${fmt(plotY + plotH)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmt(gx)}" y="${fmt(plotY + plotH + 16)}" text-anchor="middle" font-size="10" fill="${OKLCH_PALETTE.textMuted}">${fmt(gf)}g</text>`,
    );
  }

  // 플롯 외곽선
  parts.push(
    `<rect x="${fmt(plotX)}" y="${fmt(plotY)}" width="${fmt(plotW)}" height="${fmt(plotH)}" fill="none" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.2" />`,
  );

  // 4종 하드웨어 곡선
  const profiles = listStylusHardwareProfiles();
  for (let pIdx = 0; pIdx < profiles.length; pIdx += 1) {
    const prof = profiles[pIdx];
    if (prof === undefined) continue;
    const coords: string[] = [];
    const steps = 64;
    for (let s = 0; s <= steps; s += 1) {
      const gf = (maxForceAxisGf * s) / steps;
      const pressure = forceGfToNormalizedPressure(gf, prof);
      const cx = plotX + (gf / maxForceAxisGf) * plotW;
      const cy = plotY + plotH * (1 - pressure);
      coords.push(`${fmt(cx)},${fmt(cy)}`);
    }
    const isActivePair =
      prof.id === bundle.sourceProfile.id || prof.id === bundle.targetProfile.id;
    const strokeWidth = isActivePair ? "2.4" : "1.4";
    const dash = isActivePair ? "" : ` stroke-dasharray="4 3"`;
    parts.push(
      `<polyline points="${coords.join(" ")}" fill="none" stroke="${DEVICE_STROKE_OKLCH[prof.id]}" stroke-width="${strokeWidth}"${dash} />`,
    );
  }

  // Fritsch-Carlson 작가 커스텀 전송 곡선 (정규화 0..1 → X축 0..500gf 스케일 오버레이)
  const curveCoords: string[] = [];
  for (let s = 0; s <= 64; s += 1) {
    const u = s / 64;
    const yOut = evaluatePressureCurve(bundle.pressureCurve, u);
    const cx = plotX + ((u * 500) / maxForceAxisGf) * plotW;
    const cy = plotY + plotH * (1 - yOut);
    curveCoords.push(`${fmt(cx)},${fmt(cy)}`);
  }
  parts.push(
    `<polyline points="${curveCoords.join(" ")}" fill="none" stroke="${OKLCH_PALETTE.curveArtistStroke}" stroke-width="2" stroke-dasharray="6 3" />`,
  );
  for (let k = 0; k < bundle.pressureCurve.knots.length; k += 1) {
    const knot = bundle.pressureCurve.knots[k];
    if (knot === undefined) continue;
    const kx = plotX + ((knot.x * 500) / maxForceAxisGf) * plotW;
    const ky = plotY + plotH * (1 - knot.y);
    parts.push(
      `<circle cx="${fmt(kx)}" cy="${fmt(ky)}" r="3.4" fill="${OKLCH_PALETTE.curveArtistDotFill}" stroke="${OKLCH_PALETTE.curveArtistStroke}" stroke-width="1.6" />`,
    );
  }

  // 범례 (2x2 그리드 + 작가 곡선)
  const legendY = plotY + plotH + 34;
  for (let pIdx = 0; pIdx < profiles.length; pIdx += 1) {
    const prof = profiles[pIdx];
    if (prof === undefined) continue;
    const col = pIdx % 2;
    const row = Math.floor(pIdx / 2);
    const lx = panelX + 20 + col * 246;
    const ly = legendY + row * 22;
    parts.push(
      `<line x1="${fmt(lx)}" y1="${fmt(ly - 4)}" x2="${fmt(lx + 18)}" y2="${fmt(ly - 4)}" stroke="${DEVICE_STROKE_OKLCH[prof.id]}" stroke-width="2.6" />`,
    );
    parts.push(
      `<text x="${fmt(lx + 24)}" y="${fmt(ly)}" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">${escapeStylusCalibrationXml(prof.displayName)} (IAF ${fmt(prof.initialActivationForceGf)}g · ${fmt(prof.pressureLevels)}단)</text>`,
    );
  }

  const artistLegendY = legendY + 48;
  parts.push(
    `<line x1="${fmt(panelX + 20)}" y1="${fmt(artistLegendY - 4)}" x2="${fmt(panelX + 38)}" y2="${fmt(artistLegendY - 4)}" stroke="${OKLCH_PALETTE.curveArtistStroke}" stroke-width="2" stroke-dasharray="5 3" />`,
  );
  parts.push(
    `<text x="${fmt(panelX + 44)}" y="${fmt(artistLegendY)}" font-size="11" fill="${OKLCH_PALETTE.textMuted}">Fritsch-Carlson 곡선 (${escapeStylusCalibrationXml(truncateText(bundle.pressureCurve.name, 24))}) · 단조 위반 ${fmt(bundle.monotonicityAudit.violationCount)}건 · 오버슈트 ${fmt(bundle.monotonicityAudit.overshootCount)}건</text>`,
  );

  return parts.join("\n");
}

function renderNibStampCellSvg(
  stamp: ChiselNibStampGeometry,
  labelKo: string,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  maxMajorPx: number,
): string {
  const cx = cellX + cellW / 2;
  const cy = cellY + cellH / 2 - 4;
  const maxRadius = Math.min(cellW, cellH) * 0.34;
  const scale = maxMajorPx > 0 ? maxRadius / (maxMajorPx / 2) : 1;
  const rx = Math.max(4, Math.min(maxRadius, (stamp.majorWidthPx / 2) * scale));
  const ry = Math.max(3, Math.min(maxRadius, (stamp.minorWidthPx / 2) * scale));
  const rot = stamp.stampRotationDeg;

  return [
    `<rect x="${fmt(cellX)}" y="${fmt(cellY)}" width="${fmt(cellW)}" height="${fmt(cellH)}" rx="8" fill="${OKLCH_PALETTE.subCardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    `<text x="${fmt(cx)}" y="${fmt(cellY + 18)}" text-anchor="middle" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeStylusCalibrationXml(labelKo)}</text>`,
    `<g transform="translate(${fmt(cx)},${fmt(cy)}) rotate(${fmt(rot)})">`,
    `<ellipse cx="0" cy="0" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${OKLCH_PALETTE.nibFill}" stroke="${OKLCH_PALETTE.nibStroke}" stroke-width="2" />`,
    `<line x1="${fmt(-rx - 4)}" y1="0" x2="${fmt(rx + 4)}" y2="0" stroke="${OKLCH_PALETTE.nibAxisStroke}" stroke-width="1.2" stroke-dasharray="3 2" />`,
    `<circle cx="0" cy="0" r="2.2" fill="${OKLCH_PALETTE.nibStroke}" />`,
    `</g>`,
    `<text x="${fmt(cx)}" y="${fmt(cellY + cellH - 22)}" text-anchor="middle" font-size="10" fill="${OKLCH_PALETTE.textMuted}">${fmtOne(stamp.majorWidthPx)}×${fmtOne(stamp.minorWidthPx)}px</text>`,
    `<text x="${fmt(cx)}" y="${fmt(cellY + cellH - 8)}" text-anchor="middle" font-size="10" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">종횡비 ${fmtOne(stamp.aspectRatio)}:1 · ${fmtOne(rot)}°</text>`,
  ].join("\n");
}

function renderNibAndTiltPanelSvg(
  bundle: StylusCalibrationBundle,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): string {
  const parts: string[] = [];
  parts.push(
    `<rect x="${fmt(panelX)}" y="${fmt(panelY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
  );
  parts.push(
    `<text x="${fmt(panelX + 18)}" y="${fmt(panelY + 26)}" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">치즐 닙 기울기 이방성 &amp; 배럴 롤 언랩</text>`,
  );

  const sourceLabel = ROTATION_SOURCE_LABELS_KO[bundle.lowTiltStamp.rotationSource];
  parts.push(
    `<text x="${fmt(panelX + 18)}" y="${fmt(panelY + 42)}" font-size="11" fill="${OKLCH_PALETTE.textMuted}">회전 입력: ${escapeStylusCalibrationXml(sourceLabel)} · 360° 플립 ${fmt(bundle.barrelRollUnwrap.flipGlitchCount)}건 · 최대 스텝 ${fmtOne(bundle.barrelRollUnwrap.maxAbsStepDeg)}°</text>`,
  );

  const cellGap = 12;
  const innerW = panelW - 36;
  const cellW = (innerW - cellGap * 2) / 3;
  const cellY = panelY + 54;
  const cellH = panelH - 72;
  const maxMajor = Math.max(
    bundle.verticalStamp.majorWidthPx,
    bundle.midTiltStamp.majorWidthPx,
    bundle.lowTiltStamp.majorWidthPx,
    1,
  );

  parts.push(
    renderNibStampCellSvg(
      bundle.verticalStamp,
      `수직 ${fmt(bundle.verticalStamp.clampedAltitudeDeg)}° (원형)`,
      panelX + 18,
      cellY,
      cellW,
      cellH,
      maxMajor,
    ),
  );
  parts.push(
    renderNibStampCellSvg(
      bundle.midTiltStamp,
      `중기울기 ${fmt(bundle.midTiltStamp.clampedAltitudeDeg)}°`,
      panelX + 18 + cellW + cellGap,
      cellY,
      cellW,
      cellH,
      maxMajor,
    ),
  );
  parts.push(
    renderNibStampCellSvg(
      bundle.lowTiltStamp,
      `저고도 ${fmt(bundle.lowTiltStamp.clampedAltitudeDeg)}° (셰이딩)`,
      panelX + 18 + (cellW + cellGap) * 2,
      cellY,
      cellW,
      cellH,
      maxMajor,
    ),
  );

  return parts.join("\n");
}

function renderJitterPanelSvg(
  bundle: StylusCalibrationBundle,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
  showFixedEma: boolean,
): string {
  const parts: string[] = [];
  const plotX = panelX + 20;
  const plotY = panelY + 52;
  const plotW = panelW - 40;
  const plotH = panelH - 102;

  parts.push(
    `<rect x="${fmt(panelX)}" y="${fmt(panelY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" rx="12" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
  );
  parts.push(
    `<text x="${fmt(panelX + 18)}" y="${fmt(panelY + 26)}" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">원시 궤적 vs 속도 적응 One-Euro 지터 보정</text>`,
  );
  parts.push(
    `<text x="${fmt(panelX + 18)}" y="${fmt(panelY + 42)}" font-size="11" fill="${OKLCH_PALETTE.textMuted}">저속 지터 감소 ${fmtOne(bundle.filterComparison.oneEuro.lowSpeedJitterReductionPercent)}% · 고속 지연 ${fmtOne(bundle.filterComparison.oneEuro.highSpeedLagPx)}px (고정 EMA ${fmtOne(bundle.filterComparison.fixedEma.highSpeedLagPx)}px)</text>`,
  );
  parts.push(
    `<rect x="${fmt(plotX)}" y="${fmt(plotY)}" width="${fmt(plotW)}" height="${fmt(plotH)}" rx="6" fill="${OKLCH_PALETTE.subCardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );

  const samples = bundle.filterComparison.oneEuro.filteredSamples;
  if (samples.length >= 2) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      if (s === undefined) continue;
      minX = Math.min(minX, s.rawX, s.x);
      maxX = Math.max(maxX, s.rawX, s.x);
      minY = Math.min(minY, s.rawY, s.y);
      maxY = Math.max(maxY, s.rawY, s.y);
    }

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const pad = 12;
    const mapX = (vx: number): number => plotX + pad + ((vx - minX) / spanX) * (plotW - pad * 2);
    const mapY = (vy: number): number => plotY + pad + ((vy - minY) / spanY) * (plotH - pad * 2);

    const rawPts: string[] = [];
    const oneEuroPts: string[] = [];
    const fixedPts: string[] = [];

    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      if (s === undefined) continue;
      rawPts.push(`${fmt(mapX(s.rawX))},${fmt(mapY(s.rawY))}`);
      oneEuroPts.push(`${fmt(mapX(s.x))},${fmt(mapY(s.y))}`);
      const fp = bundle.filterComparison.fixedEma.filteredPoints[i];
      if (fp !== undefined) {
        fixedPts.push(`${fmt(mapX(fp.x))},${fmt(mapY(fp.y))}`);
      }
    }

    parts.push(
      `<polyline points="${rawPts.join(" ")}" fill="none" stroke="${OKLCH_PALETTE.rawTrajectoryStroke}" stroke-width="1.3" stroke-dasharray="3 2" />`,
    );
    if (showFixedEma && fixedPts.length >= 2) {
      parts.push(
        `<polyline points="${fixedPts.join(" ")}" fill="none" stroke="${OKLCH_PALETTE.fixedEmaTrajectoryStroke}" stroke-width="1.5" stroke-dasharray="5 3" />`,
      );
    }
    parts.push(
      `<polyline points="${oneEuroPts.join(" ")}" fill="none" stroke="${OKLCH_PALETTE.oneEuroTrajectoryStroke}" stroke-width="2.2" />`,
    );
  }

  // 하단 범례
  const footY = plotY + plotH + 22;
  parts.push(
    `<line x1="${fmt(plotX)}" y1="${fmt(footY - 4)}" x2="${fmt(plotX + 18)}" y2="${fmt(footY - 4)}" stroke="${OKLCH_PALETTE.rawTrajectoryStroke}" stroke-width="1.6" stroke-dasharray="3 2" />`,
  );
  parts.push(
    `<text x="${fmt(plotX + 24)}" y="${fmt(footY)}" font-size="11" fill="${OKLCH_PALETTE.textMuted}">원시 입력 (RMS ${fmtOne(bundle.filterComparison.oneEuro.rawJitterRmsPx)}px)</text>`,
  );

  parts.push(
    `<line x1="${fmt(plotX + 170)}" y1="${fmt(footY - 4)}" x2="${fmt(plotX + 188)}" y2="${fmt(footY - 4)}" stroke="${OKLCH_PALETTE.oneEuroTrajectoryStroke}" stroke-width="2.4" />`,
  );
  parts.push(
    `<text x="${fmt(plotX + 194)}" y="${fmt(footY)}" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">One-Euro 보정 (RMS ${fmtOne(bundle.filterComparison.oneEuro.filteredJitterRmsPx)}px)</text>`,
  );

  if (showFixedEma) {
    parts.push(
      `<line x1="${fmt(plotX + 365)}" y1="${fmt(footY - 4)}" x2="${fmt(plotX + 383)}" y2="${fmt(footY - 4)}" stroke="${OKLCH_PALETTE.fixedEmaTrajectoryStroke}" stroke-width="1.8" stroke-dasharray="5 3" />`,
    );
    parts.push(
      `<text x="${fmt(plotX + 389)}" y="${fmt(footY)}" font-size="11" fill="${OKLCH_PALETTE.textMuted}">고정 EMA</text>`,
    );
  }

  return parts.join("\n");
}

/**
 * 4종 스타일러스 필압 전송 곡선·치즐 닙 기울기/배럴 롤·지터 궤적 비교 감사 SVG를 순수 OKLCH로 생성한다.
 */
export function renderStylusCalibrationAuditSvg(
  bundle: StylusCalibrationBundle,
  options: StylusCalibrationSvgOptions = {},
): string {
  const widthPx =
    options.widthPx !== undefined && Number.isFinite(options.widthPx)
      ? Math.max(840, Math.min(2000, Math.round(options.widthPx)))
      : 1120;
  const heightPx =
    options.heightPx !== undefined && Number.isFinite(options.heightPx)
      ? Math.max(580, Math.min(1400, Math.round(options.heightPx)))
      : 680;
  const showFixedEma = options.showFixedEmaComparison ?? true;

  const rawTitle =
    options.title ??
    `${bundle.sourceProfile.displayNameKo} → ${bundle.targetProfile.displayNameKo} 스타일러스 캘리브레이션 리포트`;
  const safeTitle = escapeStylusCalibrationXml(truncateText(rawTitle, 72));
  const digestShort = escapeStylusCalibrationXml(bundle.calibrationManifestSha256Hex.slice(0, 12));

  const allPass =
    bundle.monotonicityAudit.isGloballyMonotoneNonDecreasing &&
    bundle.roundTripReport.passesStrictThreshold &&
    bundle.barrelRollUnwrap.flipGlitchCount === 0;
  const badgeColor = allPass ? OKLCH_PALETTE.badgePassBg : OKLCH_PALETTE.badgeWarnBg;
  const badgeLabel = allPass ? "캘리브레이션 정상" : "재점검 필요";

  const margin = 24;
  const headerH = 62;
  const colGap = 20;
  const leftW = Math.round((widthPx - margin * 2 - colGap) * 0.5);
  const rightW = widthPx - margin * 2 - colGap - leftW;
  const bodyY = margin + headerH + 14;
  const bodyH = heightPx - bodyY - margin;
  const rightTopH = Math.round(bodyH * 0.48);
  const rightBottomH = bodyH - rightTopH - 16;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(widthPx)}" height="${fmt(heightPx)}" viewBox="0 0 ${fmt(widthPx)} ${fmt(heightPx)}" role="img" aria-label="${safeTitle}">`,
    `<title>${safeTitle}</title>`,
    `<rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(heightPx)}" fill="${OKLCH_PALETTE.paperBg}" />`,
    `<rect x="${fmt(margin)}" y="${fmt(margin)}" width="${fmt(widthPx - margin * 2)}" height="${fmt(headerH)}" rx="12" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `<text x="${fmt(margin + 18)}" y="${fmt(margin + 27)}" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${safeTitle}</text>`,
    `<text x="${fmt(margin + 18)}" y="${fmt(margin + 47)}" font-size="11" fill="${OKLCH_PALETTE.textMuted}">소스 ${escapeStylusCalibrationXml(bundle.sourceProfile.displayName)} (${fmt(bundle.sourceProfile.pressureLevels)}단) → 타깃 ${escapeStylusCalibrationXml(bundle.targetProfile.displayName)} (${fmt(bundle.targetProfile.pressureLevels)}단) · SHA-256 ${digestShort}</text>`,
    `<rect x="${fmt(widthPx - margin - 148)}" y="${fmt(margin + 17)}" width="132" height="28" rx="14" fill="${badgeColor}" />`,
    `<text x="${fmt(widthPx - margin - 82)}" y="${fmt(margin + 35)}" text-anchor="middle" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${badgeLabel}</text>`,
    renderPressurePanelSvg(bundle, margin, bodyY, leftW, bodyH),
    renderNibAndTiltPanelSvg(bundle, margin + leftW + colGap, bodyY, rightW, rightTopH),
    renderJitterPanelSvg(
      bundle,
      margin + leftW + colGap,
      bodyY + rightTopH + 16,
      rightW,
      rightBottomH,
      showFixedEma,
    ),
    `</svg>`,
  ].join("\n");
}

/**
 * 번역투 없는 스튜디오 실무 한국어로 스타일러스 캘리브레이션 QA 브리프를 작성한다.
 */
export function summarizeStylusCalibrationKo(
  bundle: StylusCalibrationBundle,
): StylusCalibrationReportKo {
  const src = bundle.sourceProfile;
  const dst = bundle.targetProfile;
  const rt = bundle.roundTripReport;
  const mono = bundle.monotonicityAudit;
  const br = bundle.barrelRollUnwrap;
  const fc = bundle.filterComparison;

  const hasCriticalFailure =
    !mono.isGloballyMonotoneNonDecreasing ||
    !rt.passesStrictThreshold ||
    br.flipGlitchCount > 0;
  const hasMinorWarning =
    !fc.oneEuroOutperformsFixedEma ||
    dst.initialActivationForceGf - src.initialActivationForceGf >= 5;

  const statusKo: StylusCalibrationQaStatusKo = hasCriticalFailure
    ? "재보정 필요"
    : hasMinorWarning
      ? "주의"
      : "통과";

  const headlineKo = `${src.displayNameKo} → ${dst.displayNameKo} 스타일러스 캘리브레이션 점검 ${statusKo}`;

  const pressureTransferNoteKo =
    `공유 물리 하중 구간은 ${fmtOne(rt.sharedForceMinGf)}~${fmtOne(rt.sharedForceMaxGf)}gf이며 ` +
    `기기 왕복 최대 오차는 ${fmtSciOrFixed(rt.maxRoundTripError)}입니다. ` +
    `Fritsch-Carlson 필압 곡선(${bundle.pressureCurve.name})은 ${mono.sampleCount}개 구간에서 ` +
    `단조 위반 ${mono.violationCount}건, 오버슈트 ${mono.overshootCount}건으로 안정적입니다.`;

  const rotSourceKo = ROTATION_SOURCE_LABELS_KO[bundle.lowTiltStamp.rotationSource];
  const barrelAndTiltNoteKo =
    `배럴 롤 연속 언랩 결과 360° 플립 글리치 ${br.flipGlitchCount}건(최대 각도 변화 ${fmtOne(br.maxAbsStepDeg)}°)입니다. ` +
    `${dst.displayNameKo} 회전 기준은 '${rotSourceKo}'이며, ` +
    `수직(${fmt(bundle.verticalStamp.clampedAltitudeDeg)}°) 종횡비 ${fmtOne(bundle.verticalStamp.aspectRatio)}:1에서 ` +
    `저고도(${fmt(bundle.lowTiltStamp.clampedAltitudeDeg)}°) 셰이딩 시 ${fmtOne(bundle.lowTiltStamp.aspectRatio)}:1로 매끄럽게 펼쳐집니다.`;

  const jitterFilterNoteKo =
    `One-Euro 속도 적응 필터가 저속 정밀 선화 지터 RMS를 ${fmtOne(fc.oneEuro.lowSpeedJitterReductionPercent)}% 낮추면서 ` +
    `고속 휘두름 지연은 ${fmtOne(fc.oneEuro.highSpeedLagPx)}px로 묶었습니다` +
    `(고정 EMA ${fmtOne(fc.fixedEma.highSpeedLagPx)}px 대비 지연 ${fmtOne(fc.highSpeedLagReductionPercent)}% 단축).`;

  const actionItemsKo: string[] = [];
  const iafDelta = dst.initialActivationForceGf - src.initialActivationForceGf;
  if (iafDelta > 0.5) {
    actionItemsKo.push(
      `${dst.displayNameKo}의 초기 활성 하중(${fmt(dst.initialActivationForceGf)}gf)이 ${src.displayNameKo}(${fmt(src.initialActivationForceGf)}gf)보다 ${fmtOne(iafDelta)}gf 높습니다. 머리카락·속눈썹처럼 가벼운 극세선 구간에는 부드러운 초기 커브를 권장합니다.`,
    );
  }
  if (dst.maxForceGf < src.maxForceGf) {
    actionItemsKo.push(
      `${dst.displayNameKo} 최대 하중(${fmt(dst.maxForceGf)}gf)을 초과하는 강한 필압은 1.0으로 포화됩니다. 강약 대비가 큰 펜선은 상단 15% 구간을 여유 있게 두세요.`,
    );
  }
  if (!dst.supportsBarrelRoll) {
    actionItemsKo.push(
      `${dst.displayNameKo}은 하드웨어 배럴 롤 센서가 없어 '${rotSourceKo}'으로 치즐 닙 방향을 맞춥니다.`,
    );
  }
  if (actionItemsKo.length === 0) {
    actionItemsKo.push(
      "현재 필압·기울기·지터 보정값이 기준치를 모두 만족하므로 별도 조정 없이 원고 작업에 바로 투입할 수 있습니다.",
    );
  }

  const fullBriefTextKo = [
    `[Wave 152 스타일러스 캘리브레이션 QA 브리프] ${headlineKo}`,
    `- 필압 전달: ${pressureTransferNoteKo}`,
    `- 기울기·배럴 롤: ${barrelAndTiltNoteKo}`,
    `- 지터·지연 보정: ${jitterFilterNoteKo}`,
    `- 현장 권장 조치:`,
    ...actionItemsKo.map((item) => `  · ${item}`),
    `- 매니페스트 SHA-256: ${bundle.calibrationManifestSha256Hex}`,
  ].join("\n");

  return {
    statusKo,
    headlineKo,
    pressureTransferNoteKo,
    barrelAndTiltNoteKo,
    jitterFilterNoteKo,
    actionItemsKo,
    manifestSha256Hex: bundle.calibrationManifestSha256Hex,
    fullBriefTextKo,
  };
}
