/**
 * Wave 116 — 인쇄 안전 순수 OKLCH 패턴 리본 SVG 시각화 & 한국어 작화 브러시 QA 브리프.
 *
 * - 원시 #hex, rgb(, rgba(, hsl( 색상을 일절 쓰지 않고 순수 oklch(...) 토큰만 사용한다.
 * - 중심 스파인, 좌·우 무접힘 리본 메쉬, 프리셋 문양 디테일, 타일 경계 눈금,
 *   곡률 히트맵(고곡률 코너 가드 강조)을 유한 좌표(NaN/Infinity 0건)와 XML 이스케이프로 렌더링한다.
 * - 번역투 없는 간결한 한국어 작화 브러시 QA 리포트를 생성한다.
 */

import { clampFinite, type Vec2 } from "./arclength-curve-and-frame-solver";
import type {
  NaiveVsGuardedRibbonComparison,
  PatternRibbonSynthesisResult,
} from "./pattern-ribbon-geometry-and-presets";

export type PatternRibbonSvgTheme = "light" | "dark";

export interface PatternRibbonSvgOptions {
  readonly title?: string;
  readonly theme?: PatternRibbonSvgTheme;
  readonly width?: number;
  readonly height?: number;
  readonly showCurvatureHeatmap?: boolean;
  readonly showTileTicks?: boolean;
  readonly showMotifOverlay?: boolean;
  readonly comparison?: NaiveVsGuardedRibbonComparison;
}

export interface PatternRibbonQaReportKo {
  readonly presetLabelKo: string;
  readonly verdictKo: "통과" | "주의" | "실패";
  readonly defectFree: boolean;
  readonly tileUniformityPassed: boolean;
  readonly headlineKo: string;
  readonly arclengthUniformityLineKo: string;
  readonly cornerGuardLineKo: string;
  readonly pressureAndCapLineKo: string;
  readonly comparisonLineKo: string | null;
  readonly bulletLinesKo: readonly string[];
  readonly fullTextKo: string;
}

interface RibbonOklchPalette {
  readonly canvasBg: string;
  readonly cardBg: string;
  readonly cardBorder: string;
  readonly gridLine: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly spineStroke: string;
  readonly tileTickStroke: string;
  readonly safe: string;
  readonly safeBg: string;
  readonly caution: string;
  readonly cautionBg: string;
  readonly danger: string;
  readonly dangerBg: string;
  readonly heatLow: string;
  readonly heatMid: string;
  readonly heatHigh: string;
  readonly cornerRingStroke: string;
}

const LIGHT_RIBBON_PALETTE: RibbonOklchPalette = {
  canvasBg: "oklch(0.985 0.006 90)",
  cardBg: "oklch(0.996 0.003 90)",
  cardBorder: "oklch(0.86 0.015 155)",
  gridLine: "oklch(0.92 0.008 92)",
  textPrimary: "oklch(0.22 0.022 155)",
  textSecondary: "oklch(0.46 0.018 155)",
  spineStroke: "oklch(0.36 0.045 235)",
  tileTickStroke: "oklch(0.32 0.085 155)",
  safe: "oklch(0.44 0.115 155)",
  safeBg: "oklch(0.95 0.025 155)",
  caution: "oklch(0.58 0.145 72)",
  cautionBg: "oklch(0.96 0.032 76)",
  danger: "oklch(0.50 0.185 26)",
  dangerBg: "oklch(0.95 0.035 26)",
  heatLow: "oklch(0.52 0.105 162)",
  heatMid: "oklch(0.64 0.155 74)",
  heatHigh: "oklch(0.52 0.195 25)",
  cornerRingStroke: "oklch(0.50 0.195 25)",
};

const DARK_RIBBON_PALETTE: RibbonOklchPalette = {
  canvasBg: "oklch(0.16 0.012 155)",
  cardBg: "oklch(0.20 0.015 155)",
  cardBorder: "oklch(0.34 0.022 155)",
  gridLine: "oklch(0.28 0.016 155)",
  textPrimary: "oklch(0.95 0.008 92)",
  textSecondary: "oklch(0.75 0.015 150)",
  spineStroke: "oklch(0.76 0.085 230)",
  tileTickStroke: "oklch(0.76 0.125 155)",
  safe: "oklch(0.74 0.135 155)",
  safeBg: "oklch(0.26 0.045 155)",
  caution: "oklch(0.80 0.145 76)",
  cautionBg: "oklch(0.28 0.052 74)",
  danger: "oklch(0.72 0.185 26)",
  dangerBg: "oklch(0.28 0.065 26)",
  heatLow: "oklch(0.72 0.125 162)",
  heatMid: "oklch(0.78 0.155 76)",
  heatHigh: "oklch(0.70 0.195 26)",
  cornerRingStroke: "oklch(0.74 0.195 26)",
};

function fmt(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(digits);
}

export function escapeSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function curvatureToHeatOklch(absCurvature: number, maxAbsCurvature: number, p: RibbonOklchPalette): string {
  const denom = Math.max(maxAbsCurvature, 0.02);
  const ratio = clampFinite(absCurvature / denom, 0, 1, 0);
  if (ratio >= 0.62) {
    return p.heatHigh;
  }
  if (ratio >= 0.28) {
    return p.heatMid;
  }
  return p.heatLow;
}

function computeContentBounds(result: PatternRibbonSynthesisResult): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const visit = (pt: Vec2): void => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  };

  for (let i = 0; i < result.stations.length; i += 1) {
    const st = result.stations[i];
    visit(st.spine);
    visit(st.leftPoint);
    visit(st.rightPoint);
  }
  for (let i = 0; i < result.startCap.vertices.length; i += 1) {
    visit(result.startCap.vertices[i]);
  }
  for (let i = 0; i < result.endCap.vertices.length; i += 1) {
    visit(result.endCap.vertices[i]);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { minX: 0, minY: 0, maxX: 200, maxY: 120 };
  }

  const pad = Math.max(16, result.maxWidthPx * 0.75);
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function buildPolylinePath(points: readonly Vec2[], mapPt: (pt: Vec2) => Vec2, closed: boolean): string {
  if (points.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const mapped = mapPt(points[i]);
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(mapped.x)} ${fmt(mapped.y)}`);
  }
  if (closed && points.length >= 3) {
    parts.push("Z");
  }
  return parts.join(" ");
}

/**
 * 중심 스파인, 좌·우 가드 리본 메쉬, 프리셋 문양 디테일, 타일 경계 눈금,
 * 고곡률 코너 히트맵을 순수 OKLCH 인쇄 안전 SVG로 렌더링한다.
 */
export function renderPatternRibbonBrushSvg(
  result: PatternRibbonSynthesisResult,
  options?: PatternRibbonSvgOptions,
): string {
  const theme: PatternRibbonSvgTheme = options?.theme ?? "light";
  const p = theme === "dark" ? DARK_RIBBON_PALETTE : LIGHT_RIBBON_PALETTE;
  const width = Math.round(clampFinite(options?.width ?? 920, 480, 2400, 920));
  const height = Math.round(clampFinite(options?.height ?? 540, 320, 1600, 540));
  const showCurvatureHeatmap = options?.showCurvatureHeatmap ?? true;
  const showTileTicks = options?.showTileTicks ?? true;
  const showMotifOverlay = options?.showMotifOverlay ?? true;

  const title =
    options?.title ?? `Wave 116 ${result.preset.labelKo} 아크-길이 패턴 리본 감사`;
  const defectFree = result.topologyAudit.foldoverFree;
  const badgeColor = defectFree ? p.safe : p.danger;
  const badgeBg = defectFree ? p.safeBg : p.dangerBg;
  const badgeLabel = defectFree
    ? "코너 접힘 0건 · 안전"
    : `결함 ${result.topologyAudit.selfIntersectionCount + result.topologyAudit.invertedQuadCount}건 감지`;

  const vpX = 28;
  const vpY = 88;
  const vpW = width - 56;
  const vpH = height - 186;

  const bounds = computeContentBounds(result);
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((vpW - 36) / spanX, (vpH - 36) / spanY);
  const offsetX = vpX + (vpW - spanX * scale) * 0.5 - bounds.minX * scale;
  const offsetY = vpY + (vpH - spanY * scale) * 0.5 - bounds.minY * scale;

  const mapPt = (pt: Vec2): Vec2 => ({
    x: pt.x * scale + offsetX,
    y: pt.y * scale + offsetY,
  });

  // 1. 리본 쿼드 메쉬 경로 (유효/반전 구분 및 프리셋 기본 채움)
  const quadPolygonsSvg = result.quads
    .map((q) => {
      const pts = [q.leftStart, q.rightStart, q.rightEnd, q.leftEnd].map(mapPt);
      const d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)} L ${fmt(pts[1].x)} ${fmt(pts[1].y)} L ${fmt(pts[2].x)} ${fmt(pts[2].y)} L ${fmt(pts[3].x)} ${fmt(pts[3].y)} Z`;
      const fill = q.inverted ? p.dangerBg : result.preset.fillOklch;
      const stroke = q.inverted ? p.danger : "oklch(0.60 0.012 155 / 0.16)";
      return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="0.7" />`;
    })
    .join("\n    ");

  // 2. 시작·끝단 캡 폴리곤
  const capPathsSvg = [result.startCap, result.endCap]
    .filter((cap) => cap.vertices.length >= 2)
    .map((cap) => {
      const d = buildPolylinePath(cap.vertices, mapPt, true);
      return `<path d="${d}" fill="${result.preset.fillOklch}" stroke="${result.preset.strokeOklch}" stroke-width="1.35" stroke-linejoin="round" />`;
    })
    .join("\n    ");

  // 3. 좌·우 외곽 경계선
  const leftEdgePath = buildPolylinePath(
    result.stations.map((s) => s.leftPoint),
    mapPt,
    false,
  );
  const rightEdgePath = buildPolylinePath(
    result.stations.map((s) => s.rightPoint),
    mapPt,
    false,
  );

  // 4. 프리셋 문양 디테일
  const motifOverlaySvg = showMotifOverlay
    ? result.motifStrokes
        .filter((m) => m.points.length >= 2)
        .map((m) => {
          const d = buildPolylinePath(m.points, mapPt, m.closed);
          const stroke = m.kind === "accent" ? result.preset.accentOklch : result.preset.strokeOklch;
          const sw = m.kind === "accent" ? "1.35" : "1.1";
          return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" />`;
        })
        .join("\n    ")
    : "";

  // 5. 중심 스파인
  const spinePath = buildPolylinePath(
    result.stations.map((s) => s.spine),
    mapPt,
    false,
  );

  // 6. 타일 경계 눈금(u = 0, 1, 2, ...)
  const tileTickSvgParts: string[] = [];
  if (showTileTicks && result.stations.length >= 2) {
    let lastRenderedTile = -1;
    for (let i = 0; i < result.stations.length; i += 1) {
      const st = result.stations[i];
      const nearInteger = Math.abs(st.u - Math.round(st.u)) <= 0.06;
      const tileNumber = Math.round(st.u);
      if ((st.isTileBoundary || nearInteger) && tileNumber !== lastRenderedTile) {
        lastRenderedTile = tileNumber;
        const l = mapPt(st.leftPoint);
        const r = mapPt(st.rightPoint);
        tileTickSvgParts.push(
          `<line x1="${fmt(l.x)}" y1="${fmt(l.y)}" x2="${fmt(r.x)}" y2="${fmt(r.y)}" stroke="${p.tileTickStroke}" stroke-width="1.25" stroke-dasharray="3 2" />`,
        );
        tileTickSvgParts.push(
          `<text x="${fmt(l.x + 4)}" y="${fmt(l.y - 4)}" font-size="10" font-weight="600" fill="${p.tileTickStroke}">T${tileNumber}</text>`,
        );
      }
    }
  }

  // 7. 곡률 히트맵 & 고곡률 코너 마이터 가드 마커
  const heatmapSvgParts: string[] = [];
  if (showCurvatureHeatmap && result.stations.length >= 2) {
    for (let i = 0; i < result.stations.length - 1; i += 1) {
      const a = result.stations[i];
      const b = result.stations[i + 1];
      const avgAbsK = 0.5 * (Math.abs(a.signedCurvature) + Math.abs(b.signedCurvature));
      const color = curvatureToHeatOklch(avgAbsK, result.maxAbsCurvature, p);
      const pa = mapPt(a.spine);
      const pb = mapPt(b.spine);
      heatmapSvgParts.push(
        `<line x1="${fmt(pa.x)}" y1="${fmt(pa.y)}" x2="${fmt(pb.x)}" y2="${fmt(pb.y)}" stroke="${color}" stroke-width="2.6" stroke-linecap="round" />`,
      );
    }

    for (let i = 0; i < result.stations.length; i += 1) {
      const st = result.stations[i];
      if (st.innerClamped || st.isBevelStation) {
        const pt = mapPt(st.spine);
        const radius = st.innerClamped ? 3.8 : 2.6;
        heatmapSvgParts.push(
          `<circle cx="${fmt(pt.x)}" cy="${fmt(pt.y)}" r="${fmt(radius, 1)}" fill="${p.cardBg}" stroke="${p.cornerRingStroke}" stroke-width="1.4" />`,
        );
      }
    }
  }

  // 8. 하단 요약 텔레메트리 스트립
  const footerY = vpY + vpH + 16;
  const uniformityErrPct = result.reparameterization.tileUniformity.maxRelativeErrorRatio * 100;
  const comparison = options?.comparison;
  const footerMetricText = comparison
    ? `단순 오프셋 결함 ${comparison.naiveTotalDefects}건 → 가드 리본 ${comparison.guardedTotalDefects}건 · 베벨 분할 ${result.bevelInsertedStationCount}개 · 내측 클램프 ${result.innerClampedStationCount}개`
    : `자기교차 ${result.topologyAudit.selfIntersectionCount}건 · 음수면적 쿼드 ${result.topologyAudit.invertedQuadCount}건 · 베벨 ${result.bevelInsertedStationCount}개 · 내측 클램프 ${result.innerClampedStationCount}개`;

  const subtitleText = `프리셋: ${result.preset.labelKo} (${result.preset.categoryKo}) · 총 아크-길이 ${fmt(result.totalArcLengthPx, 1)}px · 타일 ${fmt(result.tileCount, 2)}개 · 타일 균일 오차 ${fmt(uniformityErrPct, 2)}%`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeSvgXml(title)}">`,
    `  <title>${escapeSvgXml(title)}</title>`,
    `  <rect x="0" y="0" width="${width}" height="${height}" fill="${p.canvasBg}" />`,
    `  <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="14" fill="${p.cardBg}" stroke="${p.cardBorder}" stroke-width="1.2" />`,
    `  <text x="32" y="46" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="18" font-weight="700" fill="${p.textPrimary}">${escapeSvgXml(title)}</text>`,
    `  <text x="32" y="68" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" fill="${p.textSecondary}">${escapeSvgXml(subtitleText)}</text>`,
    `  <rect x="${width - 210}" y="28" width="178" height="30" rx="15" fill="${badgeBg}" stroke="${badgeColor}" stroke-width="1.1" />`,
    `  <text x="${width - 121}" y="47" text-anchor="middle" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" font-weight="700" fill="${badgeColor}">${escapeSvgXml(badgeLabel)}</text>`,
    `  <rect x="${vpX}" y="${vpY}" width="${vpW}" height="${vpH}" rx="10" fill="${p.canvasBg}" stroke="${p.gridLine}" stroke-width="1" />`,
    `  <g data-layer="ribbon-quads">`,
    `    ${quadPolygonsSvg}`,
    `  </g>`,
    `  <g data-layer="ribbon-caps">`,
    `    ${capPathsSvg}`,
    `  </g>`,
    `  <g data-layer="ribbon-edges">`,
    leftEdgePath
      ? `    <path d="${leftEdgePath}" fill="none" stroke="${result.preset.strokeOklch}" stroke-width="1.5" stroke-linejoin="round" />`
      : "",
    rightEdgePath
      ? `    <path d="${rightEdgePath}" fill="none" stroke="${result.preset.strokeOklch}" stroke-width="1.5" stroke-linejoin="round" />`
      : "",
    `  </g>`,
    `  <g data-layer="pattern-motifs">`,
    `    ${motifOverlaySvg}`,
    `  </g>`,
    `  <g data-layer="center-spine">`,
    spinePath
      ? `    <path d="${spinePath}" fill="none" stroke="${p.spineStroke}" stroke-width="1.1" stroke-dasharray="4 3" />`
      : "",
    `  </g>`,
    `  <g data-layer="tile-ticks">`,
    `    ${tileTickSvgParts.join("\n    ")}`,
    `  </g>`,
    `  <g data-layer="curvature-heatmap">`,
    `    ${heatmapSvgParts.join("\n    ")}`,
    `  </g>`,
    `  <rect x="${vpX}" y="${footerY}" width="${vpW}" height="62" rx="10" fill="${p.canvasBg}" stroke="${p.gridLine}" stroke-width="1" />`,
    `  <text x="${vpX + 16}" y="${footerY + 24}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" font-weight="600" fill="${p.textPrimary}">${escapeSvgXml(footerMetricText)}</text>`,
    `  <circle cx="${vpX + 22}" cy="${footerY + 44}" r="4.5" fill="${p.heatLow}" />`,
    `  <text x="${vpX + 32}" y="${footerY + 48}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" fill="${p.textSecondary}">저곡률 구간</text>`,
    `  <circle cx="${vpX + 126}" cy="${footerY + 44}" r="4.5" fill="${p.heatMid}" />`,
    `  <text x="${vpX + 136}" y="${footerY + 48}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" fill="${p.textSecondary}">중곡률 회전</text>`,
    `  <circle cx="${vpX + 230}" cy="${footerY + 44}" r="4.5" fill="${p.heatHigh}" />`,
    `  <text x="${vpX + 240}" y="${footerY + 48}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" fill="${p.textSecondary}">고곡률 가드 활성 (최대 |κ|=${fmt(result.maxAbsCurvature, 3)} rad/px)</text>`,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 번역투 없는 간결한 한국어 작화 브러시 품질 QA 브리프를 생성한다.
 */
export function summarizePatternRibbonBrushKo(
  result: PatternRibbonSynthesisResult,
  comparison?: NaiveVsGuardedRibbonComparison,
): PatternRibbonQaReportKo {
  const defectCount =
    result.topologyAudit.selfIntersectionCount + result.topologyAudit.invertedQuadCount;
  const defectFree = result.topologyAudit.foldoverFree;
  const tileUniformityPassed = result.reparameterization.tileUniformity.withinOnePercent;
  const uniformityErrPct = result.reparameterization.tileUniformity.maxRelativeErrorRatio * 100;

  let verdictKo: "통과" | "주의" | "실패";
  if (defectFree && tileUniformityPassed) {
    verdictKo = "통과";
  } else if (defectFree) {
    verdictKo = "주의";
  } else {
    verdictKo = "실패";
  }

  const headlineKo = `${result.preset.labelKo} 리본 브러시(${verdictKo}) — 아크-길이 ${fmt(result.totalArcLengthPx, 1)}px · 타일 ${fmt(result.tileCount, 2)}개 · 코너 접힘 ${defectCount}건`;

  const arclengthUniformityLineKo = `목표 타일 간격 ${fmt(result.tileRepeatLengthPx, 1)}px 기준 최대 오차 ${fmt(uniformityErrPct, 2)}%(허용 한계 1.00%)로 포인터 속도 변화 구간에서도 문양 밀도를 고르게 유지했습니다.`;

  const cornerGuardLineKo =
    defectFree
      ? `최대 곡률 ${fmt(result.maxAbsCurvature, 3)} rad/px 구간에 베벨 분할 ${result.bevelInsertedStationCount}개와 내측 오프셋 클램핑 ${result.innerClampedStationCount}개 스테이션을 적용해 자기교차 0건과 음수 면적 쿼드 0건을 확인했습니다.`
      : `자기교차 ${result.topologyAudit.selfIntersectionCount}건과 음수 면적 쿼드 ${result.topologyAudit.invertedQuadCount}건이 남아 있어 곡률 가드 재조정이 필요합니다.`;

  const pressureAndCapLineKo = `필압 ${fmt(result.minPressure, 2)}~${fmt(result.maxPressure, 2)} 범위에 맞춰 리본 폭을 ${fmt(result.minWidthPx, 1)}~${fmt(result.maxWidthPx, 1)}px로 조절했고 시작(${result.startCap.capStyle})·끝단(${result.endCap.capStyle}) 캡을 마감했습니다.`;

  const comparisonLineKo = comparison
    ? `단순 오프셋은 급커브에서 결함 ${comparison.naiveTotalDefects}건이 발생했으나 곡률 가드 리본은 ${comparison.guardedTotalDefects}건으로 줄여 내측 접힘을 차단했습니다.`
    : null;

  const bulletLinesKo: string[] = [
    `□ ${headlineKo}`,
    `  ㅇ ${arclengthUniformityLineKo}`,
    `  ㅇ ${cornerGuardLineKo}`,
    `  ㅇ ${pressureAndCapLineKo}`,
  ];
  if (comparisonLineKo !== null) {
    bulletLinesKo.push(`  ㅇ ${comparisonLineKo}`);
  }

  return {
    presetLabelKo: result.preset.labelKo,
    verdictKo,
    defectFree,
    tileUniformityPassed,
    headlineKo,
    arclengthUniformityLineKo,
    cornerGuardLineKo,
    pressureAndCapLineKo,
    comparisonLineKo,
    bulletLinesKo,
    fullTextKo: bulletLinesKo.join("\n"),
  };
}
