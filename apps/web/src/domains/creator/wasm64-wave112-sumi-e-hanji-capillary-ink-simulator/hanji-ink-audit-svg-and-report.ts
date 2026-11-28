/**
 * Wave 112 — 고대비 인쇄 안전 OKLCH 화선지 발묵·갈필 진단 SVG 시트 및 자연스러운 한국어 QA 리포트.
 *
 * - 원시 hex/rgb 색상 리터럴 없이 OKLCH 토큰만으로 렌더링
 * - NaN/Infinity 완전 차단 및 모든 텍스트 XML 이스케이프 처리
 * - 번역투 없는 실무 한국어 수묵 브러시 점검 요약 생성
 */

import {
  clampNumber,
  type HanjiInkSimulationAudit,
  type KoreanInkTechniquePreset,
} from "./hanji-capillary-ink-physics";
import type { GalpilDryBrushStrokeResult } from "./galpil-bristle-rake-and-wgsl";

export type HanjiAuditSvgTheme = "light" | "dark";

export interface HanjiAuditSvgOptions {
  readonly title?: string;
  readonly subtitle?: string;
  readonly theme?: HanjiAuditSvgTheme;
  readonly heatmapResolution?: number;
}

export interface HanjiInkSessionReportKo {
  readonly preset: KoreanInkTechniquePreset;
  readonly presetLabelKo: string;
  readonly massConservationStatusKo: string;
  readonly cflStabilityStatusKo: string;
  readonly carbonMassErrorPercent: number;
  readonly initialDropRadius: number;
  readonly carbonSpreadRadius: number;
  readonly waterSpreadRadius: number;
  readonly bloomGrowthRatio: number;
  readonly chromatographicHaloWidth: number;
  readonly anisotropySpreadRatio: number;
  readonly flyingWhiteRatio: number | null;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly bulletLinesKo: readonly string[];
}

interface OklchSheetPalette {
  readonly pageBg: string;
  readonly panelBg: string;
  readonly panelBorder: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly axisStroke: string;
  readonly waterCurve: string;
  readonly carbonCurve: string;
  readonly depositedCurve: string;
  readonly accentForest: string;
  readonly badgeBg: string;
  readonly badgeBorder: string;
  readonly bristleInk: string;
  readonly hanjiSurface: string;
}

const LIGHT_OKLCH_PALETTE: OklchSheetPalette = {
  pageBg: "oklch(0.975 0.011 86)",
  panelBg: "oklch(0.992 0.005 88)",
  panelBorder: "oklch(0.84 0.018 155)",
  textPrimary: "oklch(0.20 0.014 245)",
  textSecondary: "oklch(0.44 0.016 240)",
  axisStroke: "oklch(0.76 0.012 240)",
  waterCurve: "oklch(0.52 0.125 232)",
  carbonCurve: "oklch(0.22 0.014 250)",
  depositedCurve: "oklch(0.52 0.095 52)",
  accentForest: "oklch(0.35 0.072 158)",
  badgeBg: "oklch(0.955 0.014 90)",
  badgeBorder: "oklch(0.82 0.024 155)",
  bristleInk: "oklch(0.19 0.012 250)",
  hanjiSurface: "oklch(0.965 0.014 85)",
};

const DARK_OKLCH_PALETTE: OklchSheetPalette = {
  pageBg: "oklch(0.17 0.012 160)",
  panelBg: "oklch(0.21 0.014 160)",
  panelBorder: "oklch(0.36 0.025 160)",
  textPrimary: "oklch(0.95 0.008 90)",
  textSecondary: "oklch(0.76 0.012 150)",
  axisStroke: "oklch(0.44 0.016 240)",
  waterCurve: "oklch(0.72 0.12 225)",
  carbonCurve: "oklch(0.92 0.01 90)",
  depositedCurve: "oklch(0.74 0.10 62)",
  accentForest: "oklch(0.74 0.11 158)",
  badgeBg: "oklch(0.25 0.016 160)",
  badgeBorder: "oklch(0.42 0.03 158)",
  bristleInk: "oklch(0.90 0.01 90)",
  hanjiSurface: "oklch(0.26 0.014 85)",
};

/** XML/SVG 텍스트 노드에 들어가는 문자열을 안전하게 이스케이프한다. */
export function escapeXmlText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function carbonAndWaterTileOklch(carbonNorm: number, waterNorm: number, theme: HanjiAuditSvgTheme): string {
  const c = clampNumber(carbonNorm, 0, 1);
  const w = clampNumber(waterNorm, 0, 1);
  if (theme === "dark") {
    const l = clampNumber(0.24 + c * 0.66, 0.2, 0.94);
    const ch = clampNumber(0.012 + Math.max(0, w - c * 0.7) * 0.085, 0.008, 0.11);
    return `oklch(${fmt(l, 3)} ${fmt(ch, 3)} ${w > c * 0.8 + 0.06 ? "228.0" : "85.0"})`;
  }
  const l = clampNumber(0.965 - Math.pow(c, 0.72) * 0.78 - w * 0.06, 0.16, 0.97);
  const halo = Math.max(0, w - c * 0.85);
  const ch = clampNumber(0.012 + halo * 0.075, 0.008, 0.095);
  return `oklch(${fmt(l, 3)} ${fmt(ch, 3)} ${halo > 0.08 ? "225.0" : "85.0"})`;
}

function buildHeatmapSvgGroup(
  audit: HanjiInkSimulationAudit,
  palette: OklchSheetPalette,
  theme: HanjiAuditSvgTheme,
  resolution: number,
): string {
  const boxX = 36;
  const boxY = 112;
  const boxSize = 312;
  const tiles = Math.round(clampNumber(resolution, 10, 32));
  const tileSize = boxSize / tiles;
  const maxC = Math.max(audit.maxCarbonDensity, 1e-4);
  const maxW = Math.max(audit.maxWaterDensity, 1e-4);

  const rects: string[] = [];
  for (let ty = 0; ty < tiles; ty += 1) {
    const sy0 = Math.floor((ty * audit.height) / tiles);
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * audit.height) / tiles));
    for (let tx = 0; tx < tiles; tx += 1) {
      const sx0 = Math.floor((tx * audit.width) / tiles);
      const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * audit.width) / tiles));
      let sumC = 0;
      let sumW = 0;
      let n = 0;
      for (let y = sy0; y < sy1; y += 1) {
        const row = y * audit.width;
        for (let x = sx0; x < sx1; x += 1) {
          sumC += audit.carbonDensityGrid[row + x];
          sumW += audit.waterDensityGrid[row + x];
          n += 1;
        }
      }
      const fill = carbonAndWaterTileOklch(sumC / (n * maxC), sumW / (n * maxW), theme);
      rects.push(
        `<rect x="${fmt(boxX + tx * tileSize)}" y="${fmt(boxY + ty * tileSize)}" width="${fmt(tileSize + 0.35)}" height="${fmt(tileSize + 0.35)}" fill="${fill}"/>`,
      );
    }
  }

  const cx = boxX + ((audit.centerX + 0.5) / audit.width) * boxSize;
  const cy = boxY + ((audit.centerY + 0.5) / audit.height) * boxSize;
  const sx = boxSize / audit.width;
  const sy = boxSize / audit.height;
  const waterRx = clampNumber(audit.waterSpreadRadius * sx, 2, boxSize * 0.48);
  const waterRy = clampNumber(audit.waterSpreadRadius * sy, 2, boxSize * 0.48);
  const carbonRx = clampNumber(audit.xSpreadRadius * sx, 2, boxSize * 0.48);
  const carbonRy = clampNumber(audit.ySpreadRadius * sy, 2, boxSize * 0.48);

  return [
    `<g id="hanji-carbon-heatmap">`,
    `<rect x="24" y="80" width="336" height="388" rx="12" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="1.2"/>`,
    `<text x="38" y="102" font-size="13" font-weight="700" fill="${palette.textPrimary}">화선지 먹물 발묵 밀도 및 수분 전선</text>`,
    ...rects,
    `<rect x="${fmt(boxX)}" y="${fmt(boxY)}" width="${fmt(boxSize)}" height="${fmt(boxSize)}" fill="none" stroke="${palette.axisStroke}" stroke-width="1"/>`,
    `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(waterRx)}" ry="${fmt(waterRy)}" fill="none" stroke="${palette.waterCurve}" stroke-width="1.6" stroke-dasharray="5 3"/>`,
    `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(carbonRx)}" ry="${fmt(carbonRy)}" fill="none" stroke="${palette.accentForest}" stroke-width="1.8"/>`,
    `<text x="38" y="446" font-size="11" fill="${palette.textSecondary}">실선: 먹핵 이방성 반경(${fmt(audit.xSpreadRadius)}×${fmt(audit.ySpreadRadius)}셀) · 점선: 수분 전선(${fmt(audit.waterSpreadRadius)}셀)</text>`,
    `</g>`,
  ].join("\n");
}

function buildRadialProfileSvgGroup(audit: HanjiInkSimulationAudit, palette: OklchSheetPalette): string {
  const plotX = 418;
  const plotY = 114;
  const plotW = 500;
  const plotH = 128;
  let peak = 0.05;
  for (let i = 0; i < audit.radialProfile.length; i += 1) {
    const s = audit.radialProfile[i];
    if (s.meanWater > peak) peak = s.meanWater;
    if (s.meanTotalCarbon > peak) peak = s.meanTotalCarbon;
  }

  const maxR = Math.max(1, audit.radialProfile.length - 1);
  const waterPts: string[] = [];
  const carbonPts: string[] = [];
  const depPts: string[] = [];
  for (let i = 0; i < audit.radialProfile.length; i += 1) {
    const s = audit.radialProfile[i];
    const px = plotX + (s.radiusCells / maxR) * plotW;
    waterPts.push(`${fmt(px)},${fmt(plotY + plotH - clampNumber(s.meanWater / peak, 0, 1) * plotH)}`);
    carbonPts.push(`${fmt(px)},${fmt(plotY + plotH - clampNumber(s.meanTotalCarbon / peak, 0, 1) * plotH)}`);
    depPts.push(`${fmt(px)},${fmt(plotY + plotH - clampNumber(s.meanDepositedCarbon / peak, 0, 1) * plotH)}`);
  }

  const cMarkX = plotX + clampNumber(audit.carbonSpreadRadius / maxR, 0, 1) * plotW;
  const wMarkX = plotX + clampNumber(audit.waterSpreadRadius / maxR, 0, 1) * plotW;
  return [
    `<g id="chromatographic-radial-profile">`,
    `<rect x="376" y="80" width="560" height="196" rx="12" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="1.2"/>`,
    `<text x="392" y="102" font-size="13" font-weight="700" fill="${palette.textPrimary}">방사형 수분·탄소 크로마토그래피 분리 곡선</text>`,
    `<line x1="${fmt(plotX)}" y1="${fmt(plotY + plotH)}" x2="${fmt(plotX + plotW)}" y2="${fmt(plotY + plotH)}" stroke="${palette.axisStroke}" stroke-width="1.1"/>`,
    `<line x1="${fmt(plotX)}" y1="${fmt(plotY)}" x2="${fmt(plotX)}" y2="${fmt(plotY + plotH)}" stroke="${palette.axisStroke}" stroke-width="1.1"/>`,
    `<line x1="${fmt(cMarkX)}" y1="${fmt(plotY)}" x2="${fmt(cMarkX)}" y2="${fmt(plotY + plotH)}" stroke="${palette.accentForest}" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<line x1="${fmt(wMarkX)}" y1="${fmt(plotY)}" x2="${fmt(wMarkX)}" y2="${fmt(plotY + plotH)}" stroke="${palette.waterCurve}" stroke-width="1" stroke-dasharray="3 3"/>`,
    `<polyline fill="none" stroke="${palette.waterCurve}" stroke-width="2.2" points="${waterPts.join(" ")}"/>`,
    `<polyline fill="none" stroke="${palette.carbonCurve}" stroke-width="2.2" points="${carbonPts.join(" ")}"/>`,
    `<polyline fill="none" stroke="${palette.depositedCurve}" stroke-width="1.6" stroke-dasharray="4 3" points="${depPts.join(" ")}"/>`,
    `<text x="418" y="262" font-size="11" fill="${palette.textSecondary}">청색: 유동 수분 · 진먹: 총 탄소 · 갈색 점선: 섬유 흡착 탄소 · 발묵 띠 폭 ${fmt(audit.chromatographicHaloWidth)}셀</text>`,
    `</g>`,
  ].join("\n");
}

function buildGalpilPreviewSvgGroup(
  galpilStroke: GalpilDryBrushStrokeResult | undefined,
  palette: OklchSheetPalette,
): string {
  const canvasX = 392;
  const canvasY = 322;
  const canvasW = 528;
  const canvasH = 114;
  const lines: string[] = [
    `<g id="galpil-flying-white-preview">`,
    `<rect x="376" y="290" width="560" height="178" rx="12" fill="${palette.panelBg}" stroke="${palette.panelBorder}" stroke-width="1.2"/>`,
    `<text x="392" y="312" font-size="13" font-weight="700" fill="${palette.textPrimary}">다중 붓털 갈필·비백(Flying-White) 궤적 미리보기</text>`,
    `<rect x="${canvasX}" y="${canvasY}" width="${canvasW}" height="${canvasH}" rx="6" fill="${palette.hanjiSurface}" stroke="${palette.axisStroke}" stroke-width="1"/>`,
  ];

  if (!galpilStroke || galpilStroke.bristleTraces.length === 0) {
    lines.push(`<text x="656" y="384" text-anchor="middle" font-size="12" fill="${palette.textSecondary}">갈필 스트로크 미입력 — 모세관 발묵 단독 분석</text>`, `</g>`);
    return lines.join("\n");
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const trace of galpilStroke.bristleTraces) {
    for (const pt of trace.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const pad = 12;

  for (const trace of galpilStroke.bristleTraces) {
    let segPts: string[] = [];
    for (const pt of trace.points) {
      const sx = canvasX + pad + ((pt.x - minX) / spanX) * (canvasW - pad * 2);
      const sy = canvasY + pad + ((pt.y - minY) / spanY) * (canvasH - pad * 2);
      if (pt.deposited) {
        segPts.push(`${fmt(sx)},${fmt(sy)}`);
      } else {
        if (segPts.length >= 2) {
          const op = fmt(clampNumber(0.35 + pt.inkLoad * 0.65, 0.25, 1), 2);
          lines.push(`<polyline fill="none" stroke="${palette.bristleInk}" stroke-opacity="${op}" stroke-width="1.65" stroke-linecap="round" points="${segPts.join(" ")}"/>`);
        }
        segPts = [];
      }
    }
    if (segPts.length >= 2) {
      lines.push(`<polyline fill="none" stroke="${palette.bristleInk}" stroke-opacity="0.88" stroke-width="1.65" stroke-linecap="round" points="${segPts.join(" ")}"/>`);
    }
  }

  lines.push(
    `<text x="392" y="456" font-size="11" fill="${palette.textSecondary}">붓털 ${galpilStroke.bristleCount}모 · 습윤도 ${fmt(galpilStroke.moisture * 100, 0)}% · 비백 공백률 ${fmt(galpilStroke.flyingWhiteRatio * 100, 1)}% · 먹 잔량 ${fmt(galpilStroke.initialMeanInkLoad, 2)}→${fmt(galpilStroke.finalMeanInkLoad, 2)}</text>`,
    `</g>`,
  );
  return lines.join("\n");
}

/** 인쇄 안전 고대비 OKLCH 화선지 수묵 발묵·갈필 진단 SVG 시트를 생성한다. */
export function renderHanjiInkWashAuditSvg(
  simulationAudit: HanjiInkSimulationAudit,
  galpilStroke?: GalpilDryBrushStrokeResult,
  options: HanjiAuditSvgOptions = {},
): string {
  const theme: HanjiAuditSvgTheme = options.theme ?? "light";
  const palette = theme === "dark" ? DARK_OKLCH_PALETTE : LIGHT_OKLCH_PALETTE;
  const title = escapeXmlText(options.title ?? `화선지 수묵 모세관·갈필 물리 감사 시트 (${simulationAudit.presetLabelKo})`);
  const subtitle = escapeXmlText(
    options.subtitle ?? `격자 ${simulationAudit.width}×${simulationAudit.height} · 시드 ${simulationAudit.seed} · 스텝 ${simulationAudit.stepCount}회 · CFL ${fmt(simulationAudit.maxCflNumber, 3)}`,
  );

  const badges: readonly { readonly label: string; readonly value: string }[] = [
    { label: "탄소 질량 오차", value: `${fmt(simulationAudit.massConservation.relativeErrorPercent, 4)}%` },
    { label: "발묵 띠 폭", value: `${fmt(simulationAudit.chromatographicHaloWidth, 2)}셀` },
    { label: "이방성 비율(X/Y)", value: `${fmt(simulationAudit.anisotropySpreadRatio, 2)}x` },
    { label: "CFL 안정성", value: simulationAudit.cflStable ? `안정 (${fmt(simulationAudit.maxCflNumber, 3)})` : "주의" },
    { label: "갈필 비백률", value: galpilStroke ? `${fmt(galpilStroke.flyingWhiteRatio * 100, 1)}%` : "미측정" },
  ];

  const badgeNodes: string[] = [];
  for (let i = 0; i < badges.length; i += 1) {
    const bx = 24 + i * 184;
    badgeNodes.push(
      `<rect x="${bx}" y="484" width="174" height="52" rx="10" fill="${palette.badgeBg}" stroke="${palette.badgeBorder}" stroke-width="1"/>`,
      `<text x="${bx + 12}" y="504" font-size="10.5" fill="${palette.textSecondary}">${escapeXmlText(badges[i].label)}</text>`,
      `<text x="${bx + 12}" y="525" font-size="13.5" font-weight="700" fill="${palette.textPrimary}">${escapeXmlText(badges[i].value)}</text>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 560" width="960" height="560" role="img" aria-label="${title}">`,
    `<rect x="0" y="0" width="960" height="560" fill="${palette.pageBg}"/>`,
    `<text x="26" y="38" font-size="18" font-weight="700" fill="${palette.textPrimary}">${title}</text>`,
    `<text x="26" y="60" font-size="12" fill="${palette.textSecondary}">${subtitle}</text>`,
    buildHeatmapSvgGroup(simulationAudit, palette, theme, options.heatmapResolution ?? 22),
    buildRadialProfileSvgGroup(simulationAudit, palette),
    buildGalpilPreviewSvgGroup(galpilStroke, palette),
    `<g id="audit-summary-strip">`,
    ...badgeNodes,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

/** 수묵 발묵·파묵·갈필 물리 검증 결과를 번역투 없는 실무 한국어 리포트로 정리한다. */
export function summarizeHanjiInkSessionKo(
  simulationAudit: HanjiInkSimulationAudit,
  galpilStroke?: GalpilDryBrushStrokeResult,
): HanjiInkSessionReportKo {
  const mc = simulationAudit.massConservation;
  const bloomGrowthRatio = simulationAudit.initialDropRadius > 1e-6
    ? simulationAudit.carbonSpreadRadius / simulationAudit.initialDropRadius
    : 1;
  const massStatus = mc.conserved
    ? `보존 통과 (오차 ${fmt(mc.relativeErrorPercent, 4)}%)`
    : `오차 초과 (${fmt(mc.relativeErrorPercent, 4)}%)`;
  const cflStatus = simulationAudit.cflStable
    ? `안정 (최대 CFL ${fmt(simulationAudit.maxCflNumber, 3)}, 클램핑 ${simulationAudit.cflClampCount}회)`
    : `한계 초과 (최대 CFL ${fmt(simulationAudit.maxCflNumber, 3)})`;

  const bulletLinesKo: string[] = [
    `기법 프리셋: ${simulationAudit.presetLabelKo} (${simulationAudit.stepCount}스텝, 누적 시간 ${fmt(simulationAudit.elapsedTime, 2)})`,
    `탄소 질량 보존: ${massStatus} · 비유한 셀 ${mc.nonFiniteCellCount}건 · 음수 셀 ${mc.negativeCellCount}건`,
    `먹물 번짐 반경: 초기 ${fmt(simulationAudit.initialDropRadius, 2)}셀 → 먹핵 ${fmt(simulationAudit.carbonSpreadRadius, 2)}셀 (${fmt(bloomGrowthRatio, 2)}배) · 수분 전선 ${fmt(simulationAudit.waterSpreadRadius, 2)}셀`,
    `크로마토그래피 발묵 띠 폭: ${fmt(simulationAudit.chromatographicHaloWidth, 2)}셀 · 화선지 이방성(가로/세로) ${fmt(simulationAudit.anisotropySpreadRatio, 2)}배`,
    `CFL 수치 안정성: ${cflStatus}`,
  ];
  if (galpilStroke) {
    bulletLinesKo.push(
      `갈필 비백 측정: ${galpilStroke.bristleCount}모 붓털 기준 비백 공백률 ${fmt(galpilStroke.flyingWhiteRatio * 100, 1)}% · 먹 잔량 ${fmt(galpilStroke.initialMeanInkLoad, 2)} → ${fmt(galpilStroke.finalMeanInkLoad, 2)} (${galpilStroke.inkDepletionMonotonic ? "단조 감소 확인" : "역전 감지"})`,
    );
  }

  const headlineKo = `${simulationAudit.presetLabelKo} 검증 완료 — 질량 오차 ${fmt(mc.relativeErrorPercent, 4)}%, 발묵 테두리 ${fmt(simulationAudit.chromatographicHaloWidth, 2)}셀`;
  const galpilSentence = galpilStroke
    ? ` 갈필 스트로크(${galpilStroke.bristleCount}모, 습윤도 ${fmt(galpilStroke.moisture * 100, 0)}%)에서는 비백 공백률 ${fmt(galpilStroke.flyingWhiteRatio * 100, 1)}%와 단조 먹 소모(${fmt(galpilStroke.initialMeanInkLoad, 2)}→${fmt(galpilStroke.finalMeanInkLoad, 2)})를 확인했다.`
    : "";
  const summaryParagraphKo = `${simulationAudit.width}×${simulationAudit.height} 화선지 격자에서 ${simulationAudit.presetLabelKo} 물리 스텝을 ${simulationAudit.stepCount}회 실행했다. 총 탄소 질량은 오차 ${fmt(mc.relativeErrorPercent, 4)}%로 보존됐고, 수분 전선(${fmt(simulationAudit.waterSpreadRadius, 2)}셀)이 먹핵(${fmt(simulationAudit.carbonSpreadRadius, 2)}셀)보다 앞서며 ${fmt(simulationAudit.chromatographicHaloWidth, 2)}셀 폭의 발묵 테두리가 형성됐다.${galpilSentence}`;

  return {
    preset: simulationAudit.preset,
    presetLabelKo: simulationAudit.presetLabelKo,
    massConservationStatusKo: massStatus,
    cflStabilityStatusKo: cflStatus,
    carbonMassErrorPercent: mc.relativeErrorPercent,
    initialDropRadius: simulationAudit.initialDropRadius,
    carbonSpreadRadius: simulationAudit.carbonSpreadRadius,
    waterSpreadRadius: simulationAudit.waterSpreadRadius,
    bloomGrowthRatio,
    chromatographicHaloWidth: simulationAudit.chromatographicHaloWidth,
    anisotropySpreadRatio: simulationAudit.anisotropySpreadRatio,
    flyingWhiteRatio: galpilStroke ? galpilStroke.flyingWhiteRatio : null,
    headlineKo,
    summaryParagraphKo,
    bulletLinesKo,
  };
}
