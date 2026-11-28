/**
 * Wave 141 — 순수 OKLCH 천문 태양 나침반·컷별 그림자 편차 SVG 렌더러 및 한국어 조명 감독 QA 브리프.
 *
 * - 원시 16진수·RGB·HSL 표현을 전혀 쓰지 않고 순수 `oklch(...)` 색상 토큰만 사용한다.
 * - 모든 동적 텍스트 노드의 XML 특수문자 5종을 이스케이프하고 비유한 수치를 사전에 차단한다.
 */

import {
  LIGHT_SOURCE_LABELS_KO,
  RIM_SIDE_LABELS_KO,
  VIOLATION_KIND_LABELS_KO,
  type CutLightingEvaluation,
  type SceneLightingAuditReport,
  type ShadowAutoCorrectionResult,
} from "./multi-cut-shadow-consistency-auditor";
import {
  clampFiniteNumber,
  computeSolarEphemeris,
  degToRad,
  type RimLightSide,
} from "./solar-ephemeris-and-shadow-math";

export interface ShadowCompassSvgOptions {
  /** 전체 SVG 폭 (px, 기본 960). */
  readonly widthPx?: number;
  /** 하단 컷 카드 열 수 (기본 3). */
  readonly columns?: number;
  /** 상단 천문 나침반에 시간별 태양 궤적 표시 여부 (기본 true). */
  readonly showSolarArc?: boolean;
}

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  surfaceBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.955 0.012 155)",
  dialBg: "oklch(0.968 0.008 92)",
  dialRing: "oklch(0.86 0.012 95)",
  borderSoft: "oklch(0.83 0.014 95)",
  borderStrong: "oklch(0.3 0.055 158)",
  textPrimary: "oklch(0.2 0.026 160)",
  textMuted: "oklch(0.45 0.022 160)",
  textInverse: "oklch(0.985 0.004 90)",
  expectedStroke: "oklch(0.42 0.125 156)",
  drawnOkStroke: "oklch(0.48 0.11 195)",
  drawnWarnStroke: "oklch(0.58 0.16 68)",
  drawnBlockerStroke: "oklch(0.5 0.195 26)",
  sunArcStroke: "oklch(0.68 0.135 76)",
  sunWarmFill: "oklch(0.72 0.165 62)",
  sunMiddayFill: "oklch(0.78 0.13 88)",
  moonCoolFill: "oklch(0.58 0.115 245)",
  shadowRayStroke: "oklch(0.36 0.045 250)",
  cameraConeFill: "oklch(0.88 0.032 160)",
  cameraConeStroke: "oklch(0.42 0.075 160)",
  rimArcStroke: "oklch(0.7 0.155 78)",
  passBadgeBg: "oklch(0.32 0.068 158)",
  warnBadgeBg: "oklch(0.56 0.16 68)",
  blockerBadgeBg: "oklch(0.48 0.19 26)",
  cardFailBg: "oklch(0.97 0.022 26)",
  cardWarnBg: "oklch(0.975 0.022 72)",
} as const;

/** XML 특수문자 5종(`<`, `>`, `&`, `"`, `'`)을 안전하게 이스케이프한다. */
export function escapeShadowXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function fmt1(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  const rounded = Math.round(value * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function pickKelvinOklchFill(colorTemperatureK: number): string {
  if (colorTemperatureK <= 4200) return OKLCH_PALETTE.sunWarmFill;
  if (colorTemperatureK >= 7000) return OKLCH_PALETTE.moonCoolFill;
  return OKLCH_PALETTE.sunMiddayFill;
}

function polarCompassPoint(
  cx: number,
  cy: number,
  radius: number,
  azimuthDeg: number,
  elevationDeg: number,
): { readonly x: number; readonly y: number } {
  const clampedElev = clampFiniteNumber(elevationDeg, 0, 90, 0);
  const r = radius * (1 - clampedElev / 90);
  const azRad = degToRad(azimuthDeg);
  return {
    x: cx + Math.sin(azRad) * r,
    y: cy - Math.cos(azRad) * r,
  };
}

function renderArrowLines(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number,
  dashed: boolean,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const headLen = 8;
  const spread = 0.48;
  const hx1 = x2 - Math.cos(angle - spread) * headLen;
  const hy1 = y2 - Math.sin(angle - spread) * headLen;
  const hx2 = x2 - Math.cos(angle + spread) * headLen;
  const hy2 = y2 - Math.sin(angle + spread) * headLen;
  const dashAttr = dashed ? ` stroke-dasharray="5 3"` : "";

  return [
    `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round"${dashAttr} />`,
    `<polyline points="${fmt(hx1)},${fmt(hy1)} ${fmt(x2)},${fmt(y2)} ${fmt(hx2)},${fmt(hy2)}" fill="none" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" />`,
  ].join("");
}

function renderRimArcIndicator(cx: number, cy: number, r: number, side: RimLightSide): string {
  if (side === "left") {
    return `<path d="M ${fmt(cx)} ${fmt(cy - r)} A ${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(cx)} ${fmt(cy + r)}" fill="none" stroke="${OKLCH_PALETTE.rimArcStroke}" stroke-width="3.5" stroke-linecap="round" />`;
  }
  if (side === "right") {
    return `<path d="M ${fmt(cx)} ${fmt(cy - r)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx)} ${fmt(cy + r)}" fill="none" stroke="${OKLCH_PALETTE.rimArcStroke}" stroke-width="3.5" stroke-linecap="round" />`;
  }
  if (side === "top") {
    return `<path d="M ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx + r)} ${fmt(cy)}" fill="none" stroke="${OKLCH_PALETTE.rimArcStroke}" stroke-width="3.5" stroke-linecap="round" />`;
  }
  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="none" stroke="${OKLCH_PALETTE.rimArcStroke}" stroke-width="2.5" stroke-dasharray="4 3" />`;
}

function renderSolarCompassPanel(
  report: SceneLightingAuditReport,
  x: number,
  y: number,
  width: number,
  height: number,
  showSolarArc: boolean,
): string {
  const cx = x + 150;
  const cy = y + height * 0.52;
  const dialR = Math.min(92, height * 0.38);

  const primaryEval = report.cutEvaluations[0];
  const isLunar = report.defaultLightSourceType === "outdoor-lunar";
  const refAzimuth = primaryEval ? primaryEval.lightAzimuthDeg : 180;
  const refElevation = primaryEval ? primaryEval.lightElevationDeg : 45;
  const refShadowAzimuth = primaryEval ? primaryEval.worldShadowAzimuthDeg : 0;
  const refKelvin = primaryEval ? primaryEval.colorTemperatureK : 5800;

  const arcPoints: string[] = [];
  if (showSolarArc) {
    const startH = isLunar ? 18 : 5;
    const endH = isLunar ? 30 : 19;
    for (let h = startH; h <= endH; h += 0.5) {
      const sample = computeSolarEphemeris({
        latitudeDeg: report.latitudeDeg,
        dayOfYear: report.dayOfYear,
        localSolarHour: h % 24,
        celestialBody: isLunar ? "moon" : "sun",
      });
      if (sample.elevationDeg > 0) {
        const pt = polarCompassPoint(cx, cy, dialR, sample.azimuthDeg, sample.elevationDeg);
        arcPoints.push(`${fmt(pt.x)},${fmt(pt.y)}`);
      }
    }
  }

  const bodyPt = polarCompassPoint(cx, cy, dialR, refAzimuth, Math.max(2, refElevation));
  const shadowEndRad = degToRad(refShadowAzimuth);
  const shadowTipX = cx + Math.sin(shadowEndRad) * (dialR * 0.72);
  const shadowTipY = cy - Math.cos(shadowEndRad) * (dialR * 0.72);

  const cameraMarkers: string[] = [];
  for (let i = 0; i < Math.min(report.cutEvaluations.length, 6); i += 1) {
    const ev = report.cutEvaluations[i];
    if (!ev) continue;
    const yawRad = degToRad(ev.cameraYawDeg);
    const tipX = cx + Math.sin(yawRad) * (dialR * 0.48);
    const tipY = cy - Math.cos(yawRad) * (dialR * 0.48);
    cameraMarkers.push(
      `<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(tipX)}" y2="${fmt(tipY)}" stroke="${OKLCH_PALETTE.cameraConeStroke}" stroke-width="1.4" stroke-dasharray="2 2" />`,
      `<circle cx="${fmt(tipX)}" cy="${fmt(tipY)}" r="3.5" fill="${OKLCH_PALETTE.cameraConeFill}" stroke="${OKLCH_PALETTE.cameraConeStroke}" stroke-width="1.2" />`,
    );
  }

  const infoX = x + 286;
  const infoLines = [
    `천문 기준: 위도 ${fmt1(report.latitudeDeg)}° · 연중 ${report.dayOfYear}일차 · 태양시 ${fmt1(report.defaultLocalSolarHour)}시`,
    `기본 광원: ${LIGHT_SOURCE_LABELS_KO[report.defaultLightSourceType]} · 방위 ${fmt1(refAzimuth)}° · 고도 ${fmt1(refElevation)}°`,
    `월드 그림자 투사 방위: ${fmt1(refShadowAzimuth)}° · 기준 색온도: ${refKelvin}K`,
    `감사 결과: 총 ${report.cutEvaluations.length}컷 중 블로커 ${report.blockerCount}건 · 경고 ${report.warningCount}건 · 일관성 ${report.continuityScore}점`,
    `조광 바이블 SHA-256: ${report.lightingManifestSha256Hex.slice(0, 20)}…`,
  ];

  const legendY = y + height - 28;
  return [
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" rx="14" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `<text x="${fmt(x + 20)}" y="${fmt(y + 26)}" fill="${OKLCH_PALETTE.textPrimary}" font-size="14" font-weight="700">천문 태양·달 궤적 나침반</text>`,
    `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(dialR)}" fill="${OKLCH_PALETTE.dialBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.4" />`,
    `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(dialR * 0.66)}" fill="none" stroke="${OKLCH_PALETTE.dialRing}" stroke-width="1" stroke-dasharray="3 3" />`,
    `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(dialR * 0.33)}" fill="none" stroke="${OKLCH_PALETTE.dialRing}" stroke-width="1" stroke-dasharray="3 3" />`,
    `<line x1="${fmt(cx - dialR)}" y1="${fmt(cy)}" x2="${fmt(cx + dialR)}" y2="${fmt(cy)}" stroke="${OKLCH_PALETTE.dialRing}" stroke-width="1" />`,
    `<line x1="${fmt(cx)}" y1="${fmt(cy - dialR)}" x2="${fmt(cx)}" y2="${fmt(cy + dialR)}" stroke="${OKLCH_PALETTE.dialRing}" stroke-width="1" />`,
    `<text x="${fmt(cx)}" y="${fmt(cy - dialR - 6)}" text-anchor="middle" fill="${OKLCH_PALETTE.textPrimary}" font-size="11" font-weight="700">북 N</text>`,
    `<text x="${fmt(cx + dialR + 12)}" y="${fmt(cy + 4)}" text-anchor="middle" fill="${OKLCH_PALETTE.textMuted}" font-size="11" font-weight="600">동 E</text>`,
    `<text x="${fmt(cx)}" y="${fmt(cy + dialR + 14)}" text-anchor="middle" fill="${OKLCH_PALETTE.textMuted}" font-size="11" font-weight="600">남 S</text>`,
    `<text x="${fmt(cx - dialR - 12)}" y="${fmt(cy + 4)}" text-anchor="middle" fill="${OKLCH_PALETTE.textMuted}" font-size="11" font-weight="600">서 W</text>`,
    arcPoints.length >= 2
      ? `<polyline points="${arcPoints.join(" ")}" fill="none" stroke="${OKLCH_PALETTE.sunArcStroke}" stroke-width="2.2" stroke-linecap="round" />`
      : "",
    cameraMarkers.join(""),
    renderArrowLines(cx, cy, shadowTipX, shadowTipY, OKLCH_PALETTE.shadowRayStroke, 2.2, false),
    `<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(bodyPt.x)}" y2="${fmt(bodyPt.y)}" stroke="${OKLCH_PALETTE.sunArcStroke}" stroke-width="1.5" stroke-dasharray="3 2" />`,
    `<circle cx="${fmt(bodyPt.x)}" cy="${fmt(bodyPt.y)}" r="8" fill="${pickKelvinOklchFill(refKelvin)}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.4" />`,
    `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="3.5" fill="${OKLCH_PALETTE.borderStrong}" />`,
    ...infoLines.map(
      (line, idx) =>
        `<text x="${fmt(infoX)}" y="${fmt(y + 58 + idx * 24)}" fill="${idx === 3 ? OKLCH_PALETTE.textPrimary : OKLCH_PALETTE.textMuted}" font-size="12.5" font-weight="${idx === 3 ? "700" : "500"}">${escapeShadowXml(line)}</text>`,
    ),
    `<line x1="${fmt(infoX)}" y1="${fmt(legendY - 4)}" x2="${fmt(infoX + 24)}" y2="${fmt(legendY - 4)}" stroke="${OKLCH_PALETTE.expectedStroke}" stroke-width="3" />`,
    `<text x="${fmt(infoX + 30)}" y="${fmt(legendY)}" fill="${OKLCH_PALETTE.textMuted}" font-size="11.5">기대 그림자 벡터</text>`,
    `<line x1="${fmt(infoX + 148)}" y1="${fmt(legendY - 4)}" x2="${fmt(infoX + 172)}" y2="${fmt(legendY - 4)}" stroke="${OKLCH_PALETTE.drawnBlockerStroke}" stroke-width="2.5" stroke-dasharray="5 3" />`,
    `<text x="${fmt(infoX + 178)}" y="${fmt(legendY)}" fill="${OKLCH_PALETTE.textMuted}" font-size="11.5">작화 그림자(위반 시 점선 강조)</text>`,
  ].join("\n");
}

function renderCutComparisonCard(
  ev: CutLightingEvaluation,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const hasBlocker = ev.blockerCount > 0;
  const hasWarn = !hasBlocker && ev.violationCount > 0;
  const cardBg = hasBlocker
    ? OKLCH_PALETTE.cardFailBg
    : hasWarn
      ? OKLCH_PALETTE.cardWarnBg
      : OKLCH_PALETTE.surfaceBg;
  const badgeBg = hasBlocker
    ? OKLCH_PALETTE.blockerBadgeBg
    : hasWarn
      ? OKLCH_PALETTE.warnBadgeBg
      : OKLCH_PALETTE.passBadgeBg;
  const badgeText = hasBlocker
    ? `블로커 ${ev.blockerCount}`
    : hasWarn
      ? `경고 ${ev.violationCount}`
      : "일치";
  const drawnStroke = hasBlocker
    ? OKLCH_PALETTE.drawnBlockerStroke
    : hasWarn
      ? OKLCH_PALETTE.drawnWarnStroke
      : OKLCH_PALETTE.drawnOkStroke;

  const dialCx = x + width * 0.5;
  const dialCy = y + 104;
  const maxArrowR = 46;
  const expectedLenPx = clampFiniteNumber(
    18 + ev.projection.expectedScreenShadowLengthRatio * 14,
    18,
    maxArrowR,
    30,
  );
  const drawnLenPx = clampFiniteNumber(
    18 + ev.drawnShadowLengthRatio * 14,
    18,
    maxArrowR,
    30,
  );

  const expRad = degToRad(ev.projection.expectedScreenShadowAngleDeg);
  const expX = dialCx + Math.cos(expRad) * expectedLenPx;
  const expY = dialCy + Math.sin(expRad) * expectedLenPx;

  const drawnRad = degToRad(ev.drawnShadowAngleDeg);
  const drawnX = dialCx + Math.cos(drawnRad) * drawnLenPx;
  const drawnY = dialCy + Math.sin(drawnRad) * drawnLenPx;

  const titleLabel = truncateText(`${ev.cutNumber}컷 · ${ev.cutLabel}`, 20);
  const metaLine = `${LIGHT_SOURCE_LABELS_KO[ev.lightSourceType]} · Yaw ${fmt1(ev.cameraYawDeg)}° · ${ev.colorTemperatureK}K`;
  const compareLine = `기대 ${fmt1(ev.projection.expectedScreenShadowAngleDeg)}° (${fmt1(ev.projection.expectedScreenShadowLengthRatio)}x) / 작화 ${fmt1(ev.drawnShadowAngleDeg)}° (${fmt1(ev.drawnShadowLengthRatio)}x)`;
  const rimLine = `림: 기대 ${RIM_SIDE_LABELS_KO[ev.projection.expectedRimSide]} · 작화 ${RIM_SIDE_LABELS_KO[ev.drawnRimSide]} · 편차 ${fmt1(ev.shadowAngleErrorDeg)}°`;

  return [
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" rx="12" fill="${cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
    `<text x="${fmt(x + 14)}" y="${fmt(y + 24)}" fill="${OKLCH_PALETTE.textPrimary}" font-size="13" font-weight="700">${escapeShadowXml(titleLabel)}</text>`,
    `<rect x="${fmt(x + width - 74)}" y="${fmt(y + 10)}" width="62" height="20" rx="10" fill="${badgeBg}" />`,
    `<text x="${fmt(x + width - 43)}" y="${fmt(y + 24)}" text-anchor="middle" fill="${OKLCH_PALETTE.textInverse}" font-size="10.5" font-weight="700">${escapeShadowXml(badgeText)}</text>`,
    `<text x="${fmt(x + 14)}" y="${fmt(y + 42)}" fill="${OKLCH_PALETTE.textMuted}" font-size="11">${escapeShadowXml(metaLine)}</text>`,
    `<circle cx="${fmt(dialCx)}" cy="${fmt(dialCy)}" r="${fmt(maxArrowR + 4)}" fill="${OKLCH_PALETTE.dialBg}" stroke="${OKLCH_PALETTE.dialRing}" stroke-width="1" />`,
    `<line x1="${fmt(dialCx - maxArrowR)}" y1="${fmt(dialCy)}" x2="${fmt(dialCx + maxArrowR)}" y2="${fmt(dialCy)}" stroke="${OKLCH_PALETTE.dialRing}" stroke-width="0.9" />`,
    `<line x1="${fmt(dialCx)}" y1="${fmt(dialCy - maxArrowR)}" x2="${fmt(dialCx)}" y2="${fmt(dialCy + maxArrowR)}" stroke="${OKLCH_PALETTE.dialRing}" stroke-width="0.9" />`,
    renderRimArcIndicator(dialCx, dialCy, 16, ev.projection.expectedRimSide),
    renderArrowLines(dialCx, dialCy, expX, expY, OKLCH_PALETTE.expectedStroke, 2.8, false),
    renderArrowLines(dialCx, dialCy, drawnX, drawnY, drawnStroke, 2.2, ev.violationCount > 0),
    `<circle cx="${fmt(dialCx)}" cy="${fmt(dialCy)}" r="4.5" fill="${OKLCH_PALETTE.borderStrong}" />`,
    `<text x="${fmt(x + 14)}" y="${fmt(y + 174)}" fill="${OKLCH_PALETTE.textPrimary}" font-size="10.8" font-weight="600">${escapeShadowXml(compareLine)}</text>`,
    `<text x="${fmt(x + 14)}" y="${fmt(y + 192)}" fill="${OKLCH_PALETTE.textMuted}" font-size="10.5">${escapeShadowXml(rimLine)}</text>`,
  ].join("\n");
}

/**
 * 상단 천문 태양 나침반 + 하단 컷별 기대·작화 그림자 비교 카드를 순수 OKLCH SVG로 렌더링한다.
 */
export function renderMultiCutShadowAuditSvg(
  report: SceneLightingAuditReport,
  options: ShadowCompassSvgOptions = {},
): string {
  const width = Math.round(clampFiniteNumber(options.widthPx ?? 960, 640, 2048, 960));
  const columns = Math.round(clampFiniteNumber(options.columns ?? 3, 1, 4, 3));
  const showSolarArc = options.showSolarArc !== false;

  const margin = 24;
  const headerH = 68;
  const compassY = margin + headerH + 14;
  const compassH = 228;
  const cardsStartY = compassY + compassH + 34;
  const gap = 14;
  const cardH = 208;
  const cardW = (width - margin * 2 - gap * (columns - 1)) / columns;
  const rowCount = Math.max(1, Math.ceil(report.cutEvaluations.length / columns));
  const totalHeight = Math.round(cardsStartY + rowCount * cardH + (rowCount - 1) * gap + margin);

  const statusBadgeBg = report.passed
    ? OKLCH_PALETTE.passBadgeBg
    : report.blockerCount > 0
      ? OKLCH_PALETTE.blockerBadgeBg
      : OKLCH_PALETTE.warnBadgeBg;
  const statusLabel = report.passed
    ? `통과 · ${report.continuityScore}점`
    : `수정 필요 · ${report.continuityScore}점`;

  const cardSvgs: string[] = [];
  for (let i = 0; i < report.cutEvaluations.length; i += 1) {
    const ev = report.cutEvaluations[i];
    if (!ev) continue;
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cx = margin + col * (cardW + gap);
    const cy = cardsStartY + row * (cardH + gap);
    cardSvgs.push(renderCutComparisonCard(ev, cx, cy, cardW, cardH));
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(totalHeight)}" width="${fmt(width)}" height="${fmt(totalHeight)}" role="img" aria-label="${escapeShadowXml(`${report.sceneTitle} 다중 컷 그림자 일관성 감사 리포트`)}">`,
    `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(totalHeight)}" fill="${OKLCH_PALETTE.paperBg}" />`,
    `<rect x="${fmt(margin)}" y="${fmt(margin)}" width="${fmt(width - margin * 2)}" height="${fmt(headerH)}" rx="14" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.4" />`,
    `<text x="${fmt(margin + 20)}" y="${fmt(margin + 28)}" fill="${OKLCH_PALETTE.textPrimary}" font-size="18" font-weight="800">${escapeShadowXml(truncateText(report.sceneTitle, 44))}</text>`,
    `<text x="${fmt(margin + 20)}" y="${fmt(margin + 50)}" fill="${OKLCH_PALETTE.textMuted}" font-size="12">Wave 141 컷 간 천문 조광·그림자 일관성 감사 · 씬 ID ${escapeShadowXml(report.sceneId)}</text>`,
    `<rect x="${fmt(width - margin - 144)}" y="${fmt(margin + 18)}" width="126" height="32" rx="16" fill="${statusBadgeBg}" />`,
    `<text x="${fmt(width - margin - 81)}" y="${fmt(margin + 39)}" text-anchor="middle" fill="${OKLCH_PALETTE.textInverse}" font-size="13" font-weight="700">${escapeShadowXml(statusLabel)}</text>`,
    renderSolarCompassPanel(report, margin, compassY, width - margin * 2, compassH, showSolarArc),
    `<text x="${fmt(margin + 4)}" y="${fmt(cardsStartY - 10)}" fill="${OKLCH_PALETTE.textPrimary}" font-size="14" font-weight="700">컷별 기대 그림자 vs 작화 그림자 비교 (${report.cutEvaluations.length}컷)</text>`,
    cardSvgs.join("\n"),
    `</svg>`,
  ].join("\n");
}

/**
 * 채색·조명 감독이 바로 수정 지시에 쓸 수 있는 자연스러운 한국어 조명 QA 브리프를 작성한다.
 */
export function summarizeMultiCutShadowAuditKo(
  report: SceneLightingAuditReport,
  correction?: ShadowAutoCorrectionResult,
): string {
  const verdict = report.passed
    ? "합격 (전 컷 조광·그림자 방향 일치)"
    : report.blockerCount > 0
      ? `수정 필수 (블로커 ${report.blockerCount}건, 경고 ${report.warningCount}건)`
      : `주의 확인 필요 (경고 ${report.warningCount}건)`;

  const lines: string[] = [
    `[조명·채색 QA 브리프] ${report.sceneTitle} (${report.sceneId})`,
    `- 판정: ${verdict} / 연속성 점수 ${report.continuityScore}점`,
    `- 천문 기준: 위도 ${fmt1(report.latitudeDeg)}°, 연중 ${report.dayOfYear}일차, 기본 태양시 ${fmt1(report.defaultLocalSolarHour)}시 (${LIGHT_SOURCE_LABELS_KO[report.defaultLightSourceType]})`,
    `- 조광 바이블 지문(SHA-256): ${report.lightingManifestSha256Hex}`,
  ];

  const firstCut = report.cutEvaluations[0];
  if (firstCut) {
    lines.push(
      `- 기준 물리 지표: 광원 방위 ${fmt1(firstCut.lightAzimuthDeg)}° / 고도 ${fmt1(firstCut.lightElevationDeg)}° / 월드 그림자 방위 ${fmt1(firstCut.worldShadowAzimuthDeg)}° / 색온도 ${firstCut.colorTemperatureK}K / 그림자 길이 비율 ${fmt1(firstCut.worldShadowLengthRatio)}x`,
    );
  }

  if (report.violations.length === 0) {
    lines.push("- 검수 소견: 카메라 리버스 샷과 시간대별 그림자 길이·림라이트가 모두 일관되게 유지되었습니다. 그대로 채색 마감으로 넘겨도 좋습니다.");
  } else {
    lines.push("- 수정 지시 목록:");
    for (let i = 0; i < report.violations.length; i += 1) {
      const v = report.violations[i];
      if (!v) continue;
      const sevLabel = v.severity === "blocker" ? "블로커" : "경고";
      lines.push(
        `  ${i + 1}. [${sevLabel} · ${VIOLATION_KIND_LABELS_KO[v.kind]}] ${v.messageKo} -> 조치: ${v.fixHintKo}`,
      );
    }
  }

  if (correction) {
    lines.push(
      `- 자동 교정 검증: 총 ${correction.resolvedViolationCount}건 해소 완료 -> 교정 후 위반 ${correction.correctedReport.violations.length}건, 연속성 ${correction.correctedReport.continuityScore}점 (해시 ${correction.lightingManifestSha256Hex.slice(0, 16)}…)`,
    );
  }

  return lines.join("\n");
}
