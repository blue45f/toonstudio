/**
 * Wave 131 — 인쇄 안전 순수 OKLCH 다중 컷 돌출 레이아웃 SVG 시각화 &
 * 번역투 없는 한국어 웹툰 컷 연출 감독 QA 브리프.
 *
 * - 원시 색상 표기를 일절 쓰지 않고 순수 oklch(...) 토큰만 사용한다.
 * - XML 특수문자 이스케이프와 유한 좌표 검증(NaN/Infinity 0건)을 보장한다.
 */

import { sanitizeFinite } from "./panel-breakout-geometry-primitives";
import {
  PANEL_FRAME_STYLES,
  type BreakoutCollisionAudit,
  type CollisionFreeBreakoutSolveResult,
  type CompiledPanelBreakoutLayout,
  type Vec2,
} from "./panel-breakout-types";

export type PanelBreakoutSvgTheme = "light" | "dark";

export interface PanelBreakoutSvgOptions {
  readonly title?: string;
  readonly theme?: PanelBreakoutSvgTheme;
  readonly width?: number;
  readonly maxHeight?: number;
  readonly showCriticalZones?: boolean;
  readonly showBreakoutCallouts?: boolean;
}

export interface PanelBreakoutQaBriefKo {
  readonly verdictKo: "통과" | "주의" | "교정 필요";
  readonly headlineKo: string;
  readonly panelSummaryLineKo: string;
  readonly breakoutSummaryLineKo: string;
  readonly collisionSummaryLineKo: string;
  readonly solverSummaryLineKo: string | null;
  readonly actionLinesKo: readonly string[];
  readonly fullTextKo: string;
}

interface BreakoutOklchPalette {
  readonly canvasBg: string;
  readonly pageSheetBg: string;
  readonly cardBg: string;
  readonly cardBorder: string;
  readonly canvasGuideStroke: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly baseArtFill: string;
  readonly baseArtStroke: string;
  readonly clippedSubjectFill: string;
  readonly clippedSubjectStroke: string;
  readonly breakoutFill: string;
  readonly breakoutStroke: string;
  readonly bridgeFill: string;
  readonly bridgeStroke: string;
  readonly safeZoneFill: string;
  readonly safeZoneStroke: string;
  readonly collidedZoneFill: string;
  readonly collidedZoneStroke: string;
  readonly badgePassBg: string;
  readonly badgePassText: string;
  readonly badgeWarnBg: string;
  readonly badgeWarnText: string;
  readonly badgeFailBg: string;
  readonly badgeFailText: string;
}

const LIGHT_PALETTE: BreakoutOklchPalette = {
  canvasBg: "oklch(0.975 0.007 90)",
  pageSheetBg: "oklch(0.996 0.003 90)",
  cardBg: "oklch(0.992 0.004 92)",
  cardBorder: "oklch(0.86 0.015 155)",
  canvasGuideStroke: "oklch(0.68 0.025 220)",
  textPrimary: "oklch(0.22 0.022 155)",
  textSecondary: "oklch(0.46 0.018 155)",
  baseArtFill: "oklch(0.935 0.018 162 / 0.62)",
  baseArtStroke: "oklch(0.62 0.045 162)",
  clippedSubjectFill: "oklch(0.84 0.055 210 / 0.72)",
  clippedSubjectStroke: "oklch(0.42 0.085 210)",
  breakoutFill: "oklch(0.76 0.155 34 / 0.76)",
  breakoutStroke: "oklch(0.48 0.195 28)",
  bridgeFill: "oklch(0.75 0.145 312 / 0.74)",
  bridgeStroke: "oklch(0.44 0.175 312)",
  safeZoneFill: "oklch(0.88 0.065 155 / 0.34)",
  safeZoneStroke: "oklch(0.42 0.115 155)",
  collidedZoneFill: "oklch(0.78 0.165 24 / 0.48)",
  collidedZoneStroke: "oklch(0.48 0.205 24)",
  badgePassBg: "oklch(0.94 0.028 155)",
  badgePassText: "oklch(0.34 0.105 155)",
  badgeWarnBg: "oklch(0.95 0.036 78)",
  badgeWarnText: "oklch(0.46 0.135 72)",
  badgeFailBg: "oklch(0.94 0.038 26)",
  badgeFailText: "oklch(0.48 0.195 26)",
};

const DARK_PALETTE: BreakoutOklchPalette = {
  canvasBg: "oklch(0.16 0.012 155)",
  pageSheetBg: "oklch(0.19 0.014 155)",
  cardBg: "oklch(0.22 0.016 155)",
  cardBorder: "oklch(0.34 0.022 155)",
  canvasGuideStroke: "oklch(0.62 0.045 220)",
  textPrimary: "oklch(0.95 0.008 92)",
  textSecondary: "oklch(0.76 0.015 150)",
  baseArtFill: "oklch(0.34 0.035 162 / 0.65)",
  baseArtStroke: "oklch(0.68 0.065 162)",
  clippedSubjectFill: "oklch(0.44 0.075 215 / 0.75)",
  clippedSubjectStroke: "oklch(0.76 0.095 215)",
  breakoutFill: "oklch(0.64 0.165 34 / 0.80)",
  breakoutStroke: "oklch(0.84 0.175 38)",
  bridgeFill: "oklch(0.62 0.155 312 / 0.78)",
  bridgeStroke: "oklch(0.82 0.165 312)",
  safeZoneFill: "oklch(0.36 0.075 155 / 0.42)",
  safeZoneStroke: "oklch(0.74 0.135 155)",
  collidedZoneFill: "oklch(0.44 0.165 24 / 0.56)",
  collidedZoneStroke: "oklch(0.78 0.195 26)",
  badgePassBg: "oklch(0.26 0.048 155)",
  badgePassText: "oklch(0.78 0.135 155)",
  badgeWarnBg: "oklch(0.28 0.055 76)",
  badgeWarnText: "oklch(0.84 0.145 78)",
  badgeFailBg: "oklch(0.28 0.065 26)",
  badgeFailText: "oklch(0.78 0.185 28)",
};

function fmt(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(digits);
  return fixed === "-0.00" || fixed === "-0.0" || fixed === "-0" ? "0" : fixed;
}

export function escapeSvgXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildClosedPath(points: readonly Vec2[], mapPt: (pt: Vec2) => Vec2): string {
  if (points.length < 3) return "";
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const raw = points[i];
    if (!raw) continue;
    const m = mapPt(raw);
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(m.x)} ${fmt(m.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * 5종 컷 프레임, 내부 클리핑 원화, 테두리 상위 돌출 피사체,
 * 인접 컷 얼굴·말풍선 보호 안전 영역을 순수 OKLCH 인쇄 안전 SVG로 렌더링한다.
 */
export function renderPanelBreakoutLayoutSvg(
  compiled: CompiledPanelBreakoutLayout,
  audit: BreakoutCollisionAudit,
  options?: PanelBreakoutSvgOptions,
): string {
  const theme: PanelBreakoutSvgTheme = options?.theme ?? "light";
  const p = theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const svgWidth = Math.round(sanitizeFinite(options?.width ?? 960, 960, 480, 2400));
  const maxHeight = Math.round(sanitizeFinite(options?.maxHeight ?? 1100, 1100, 360, 3200));
  const showCriticalZones = options?.showCriticalZones ?? true;
  const showBreakoutCallouts = options?.showBreakoutCallouts ?? true;

  const headerH = 78;
  const footerH = 64;
  const sideMargin = 48;

  // 콘텐츠 범위 계산 (좌우 돌출 피사체까지 포함)
  let minX = 0;
  let maxX = compiled.canvasWidthPx;
  let minY = 0;
  let maxY = compiled.contentHeightPx;

  for (let i = 0; i < compiled.panels.length; i += 1) {
    const panel = compiled.panels[i];
    if (!panel) continue;
    if (panel.frame.bounds.minX < minX) minX = panel.frame.bounds.minX;
    if (panel.frame.bounds.maxX > maxX) maxX = panel.frame.bounds.maxX;
    if (panel.frame.bounds.minY < minY) minY = panel.frame.bounds.minY;
    if (panel.frame.bounds.maxY > maxY) maxY = panel.frame.bounds.maxY;
    for (let s = 0; s < panel.subjects.length; s += 1) {
      const sub = panel.subjects[s];
      if (!sub || sub.renderPolygon.length < 3) continue;
      if (sub.bounds.minX < minX) minX = sub.bounds.minX;
      if (sub.bounds.maxX > maxX) maxX = sub.bounds.maxX;
      if (sub.bounds.minY < minY) minY = sub.bounds.minY;
      if (sub.bounds.maxY > maxY) maxY = sub.bounds.maxY;
    }
  }

  const worldPadX = 36;
  const worldPadY = 24;
  const spanX = Math.max(120, maxX - minX + worldPadX * 2);
  const spanY = Math.max(120, maxY - minY + worldPadY * 2);

  const availW = svgWidth - sideMargin * 2;
  const availH = Math.max(220, maxHeight - headerH - footerH - 24);
  const scale = Math.min(availW / spanX, availH / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const svgHeight = Math.max(360, Math.ceil(headerH + drawnH + footerH + 24));

  const originX = (svgWidth - drawnW) * 0.5 - (minX - worldPadX) * scale;
  const originY = headerH + 12 - (minY - worldPadY) * scale;

  const mapPt = (pt: Vec2): Vec2 => ({
    x: pt.x * scale + originX,
    y: pt.y * scale + originY,
  });

  const collidedZoneKeys = new Set<string>();
  for (let i = 0; i < audit.neighborCriticalZoneCollisions.length; i += 1) {
    const c = audit.neighborCriticalZoneCollisions[i];
    if (c) {
      collidedZoneKeys.add(`${c.neighborPanelId}::${c.zoneId}`);
    }
  }

  const panelLookup = new Map(compiled.panels.map((entry) => [entry.panelId, entry]));

  // Z-오더 순으로 레이어 렌더
  const layerElements: string[] = [];
  for (let i = 0; i < compiled.zStack.length; i += 1) {
    const layer = compiled.zStack[i];
    if (!layer) continue;
    const panelEntry = panelLookup.get(layer.panelId);
    const styleSpec = panelEntry ? PANEL_FRAME_STYLES[panelEntry.style] : PANEL_FRAME_STYLES["classic-rect"];

    if (layer.kind === "panel-background") {
      const d = buildClosedPath(layer.polygon, mapPt);
      if (d) {
        const fill = theme === "dark" ? styleSpec.fillOklchDark : styleSpec.fillOklchLight;
        layerElements.push(
          `<path data-layer-kind="panel-background" data-panel-id="${escapeSvgXml(layer.panelId)}" d="${d}" fill="${fill}" stroke="none" />`,
        );
      }
    } else if (layer.kind === "base-art") {
      for (let k = 0; k < layer.pieces.length; k += 1) {
        const piece = layer.pieces[k];
        if (!piece) continue;
        const d = buildClosedPath(piece, mapPt);
        if (d) {
          layerElements.push(
            `<path data-layer-kind="base-art" data-panel-id="${escapeSvgXml(layer.panelId)}" d="${d}" fill="${p.baseArtFill}" stroke="${p.baseArtStroke}" stroke-width="0.9" />`,
          );
        }
      }
    } else if (layer.kind === "clipped-subject") {
      for (let k = 0; k < layer.pieces.length; k += 1) {
        const piece = layer.pieces[k];
        if (!piece) continue;
        const d = buildClosedPath(piece, mapPt);
        if (d) {
          layerElements.push(
            `<path data-layer-kind="clipped-subject" data-panel-id="${escapeSvgXml(layer.panelId)}" d="${d}" fill="${p.clippedSubjectFill}" stroke="${p.clippedSubjectStroke}" stroke-width="1.2" />`,
          );
        }
      }
    } else if (layer.kind === "panel-border-stroke") {
      const d = buildClosedPath(layer.polygon, mapPt);
      const strokeW = panelEntry ? panelEntry.frame.borderStrokeWidthPx : 3;
      if (d && strokeW > 0) {
        const strokeColor = theme === "dark" ? styleSpec.strokeOklchDark : styleSpec.strokeOklchLight;
        layerElements.push(
          `<path data-layer-kind="panel-border-stroke" data-panel-id="${escapeSvgXml(layer.panelId)}" d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${fmt(Math.max(1.2, strokeW * scale))}" stroke-linejoin="miter" />`,
        );
      } else if (d) {
        const dashStroke = theme === "dark" ? styleSpec.strokeOklchDark : styleSpec.strokeOklchLight;
        layerElements.push(
          `<path data-layer-kind="panel-border-stroke" data-panel-id="${escapeSvgXml(layer.panelId)}" d="${d}" fill="none" stroke="${dashStroke}" stroke-width="1" stroke-dasharray="5 4" />`,
        );
      }
    } else if (
      layer.kind === "gutter-breakout-subject" ||
      layer.kind === "cross-panel-bridge-subject"
    ) {
      const d = buildClosedPath(layer.polygon, mapPt);
      if (d) {
        const isBridge = layer.kind === "cross-panel-bridge-subject";
        const fill = isBridge ? p.bridgeFill : p.breakoutFill;
        const stroke = isBridge ? p.bridgeStroke : p.breakoutStroke;
        layerElements.push(
          `<path data-layer-kind="${layer.kind}" data-z="${layer.zIndex}" data-panel-id="${escapeSvgXml(layer.panelId)}" d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="2.1" stroke-linejoin="round" />`,
        );
      }
    }
  }

  // 인접 컷 보호 영역(얼굴·말풍선) 오버레이
  const criticalZoneElements: string[] = [];
  if (showCriticalZones) {
    for (let i = 0; i < compiled.panels.length; i += 1) {
      const panel = compiled.panels[i];
      if (!panel) continue;
      for (let z = 0; z < panel.criticalZones.length; z += 1) {
        const zone = panel.criticalZones[z];
        if (!zone || zone.polygon.length < 3) continue;
        const d = buildClosedPath(zone.polygon, mapPt);
        const collided = collidedZoneKeys.has(`${panel.panelId}::${zone.zoneId}`);
        const fill = collided ? p.collidedZoneFill : p.safeZoneFill;
        const stroke = collided ? p.collidedZoneStroke : p.safeZoneStroke;
        const topLeft = mapPt({ x: zone.bounds.minX, y: zone.bounds.minY });
        criticalZoneElements.push(
          `<path data-critical-zone="${escapeSvgXml(zone.zoneId)}" data-collided="${collided ? "true" : "false"}" d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${collided ? "2.0" : "1.3"}" stroke-dasharray="${collided ? "4 2" : "6 3"}" />`,
        );
        criticalZoneElements.push(
          `<text x="${fmt(topLeft.x + 4)}" y="${fmt(topLeft.y + 13)}" fill="${stroke}" font-size="10.5" font-weight="600" font-family="sans-serif">${escapeSvgXml(zone.labelKo)}</text>`,
        );
      }
    }
  }

  // 컷 라벨 및 돌출 면적 배지
  const labelElements: string[] = [];
  for (let i = 0; i < compiled.panels.length; i += 1) {
    const panel = compiled.panels[i];
    if (!panel) continue;
    const styleSpec = PANEL_FRAME_STYLES[panel.style];
    const anchor = mapPt({ x: panel.frame.bounds.minX + 8, y: panel.frame.bounds.minY + 18 });
    labelElements.push(
      `<text x="${fmt(anchor.x)}" y="${fmt(anchor.y)}" fill="${p.textSecondary}" font-size="11" font-weight="600" font-family="sans-serif">${escapeSvgXml(`${panel.panelId} · ${styleSpec.labelKo}`)}</text>`,
    );

    if (showBreakoutCallouts) {
      for (let s = 0; s < panel.subjects.length; s += 1) {
        const sub = panel.subjects[s];
        if (!sub || sub.breakoutMode === "clipped-inside" || sub.renderPolygon.length < 3) {
          continue;
        }
        const badgePt = mapPt({
          x: (sub.bounds.minX + sub.bounds.maxX) * 0.5,
          y: (sub.bounds.minY + sub.bounds.maxY) * 0.5,
        });
        const badgeText = `${sub.labelKo} (+${Math.round(sub.breakoutOverflowAreaPx2)}px²)`;
        labelElements.push(
          `<text x="${fmt(badgePt.x)}" y="${fmt(badgePt.y)}" text-anchor="middle" fill="${p.textPrimary}" font-size="11" font-weight="700" font-family="sans-serif">${escapeSvgXml(badgeText)}</text>`,
        );
      }
    }
  }

  const canvasLeftX = mapPt({ x: 0, y: 0 }).x;
  const canvasRightX = mapPt({ x: compiled.canvasWidthPx, y: 0 }).x;
  const canvasTopY = mapPt({ x: 0, y: minY }).y;
  const canvasBottomY = mapPt({ x: 0, y: maxY }).y;

  const badgeBg =
    audit.verdict === "pass"
      ? p.badgePassBg
      : audit.verdict === "warn"
        ? p.badgeWarnBg
        : p.badgeFailBg;
  const badgeText =
    audit.verdict === "pass"
      ? p.badgePassText
      : audit.verdict === "warn"
        ? p.badgeWarnText
        : p.badgeFailText;
  const badgeLabel =
    audit.verdict === "pass"
      ? "무침범 통과 · 충돌 0건"
      : audit.verdict === "warn"
        ? "경계 통과 · 돌출 면적 점검"
        : `충돌 ${audit.neighborCriticalZoneCollisionCount}건 · 잘림 ${audit.canvasHorizontalClipViolationCount}건`;

  const title = options?.title ?? `Wave 131 ${compiled.titleKo} 컷 돌출 합성 감사`;
  const shortHash = compiled.manifestSha256Hex.slice(0, 12);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" role="img" aria-label="${escapeSvgXml(title)}">`,
    `  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${p.canvasBg}" />`,
    `  <rect x="16" y="14" width="${svgWidth - 32}" height="56" rx="12" fill="${p.cardBg}" stroke="${p.cardBorder}" stroke-width="1" />`,
    `  <text x="32" y="39" fill="${p.textPrimary}" font-size="16" font-weight="700" font-family="sans-serif">${escapeSvgXml(title)}</text>`,
    `  <text x="32" y="58" fill="${p.textSecondary}" font-size="11.5" font-family="sans-serif">${escapeSvgXml(`컷 ${compiled.panels.length}개 · 돌출 피사체 ${compiled.totalBreakoutSubjectCount}개 · 돌출 면적 ${Math.round(compiled.totalBreakoutOverflowAreaPx2)}px² · SHA-256 ${shortHash}`)}</text>`,
    `  <rect x="${svgWidth - 244}" y="26" width="212" height="32" rx="16" fill="${badgeBg}" />`,
    `  <text x="${svgWidth - 138}" y="46" text-anchor="middle" fill="${badgeText}" font-size="12" font-weight="700" font-family="sans-serif">${escapeSvgXml(badgeLabel)}</text>`,
    `  <rect x="${fmt(canvasLeftX)}" y="${fmt(canvasTopY)}" width="${fmt(Math.max(1, canvasRightX - canvasLeftX))}" height="${fmt(Math.max(1, canvasBottomY - canvasTopY))}" fill="${p.pageSheetBg}" stroke="${p.canvasGuideStroke}" stroke-width="1.2" stroke-dasharray="6 4" />`,
    `  <g data-group="z-order-compositor">`,
    ...layerElements.map((line) => `    ${line}`),
    `  </g>`,
    `  <g data-group="critical-zones">`,
    ...criticalZoneElements.map((line) => `    ${line}`),
    `  </g>`,
    `  <g data-group="annotations">`,
    ...labelElements.map((line) => `    ${line}`),
    `  </g>`,
    `  <rect x="16" y="${svgHeight - footerH + 8}" width="${svgWidth - 32}" height="44" rx="10" fill="${p.cardBg}" stroke="${p.cardBorder}" stroke-width="1" />`,
    `  <text x="32" y="${svgHeight - footerH + 34}" fill="${p.textSecondary}" font-size="11.5" font-family="sans-serif">${escapeSvgXml(`캔버스 폭 ${Math.round(compiled.canvasWidthPx)}px · 좌우 최대 잘림 ${(audit.maxHorizontalClipRatioObserved * 100).toFixed(1)}% (허용 ${(compiled.maxHorizontalClipRatio * 100).toFixed(0)}%) · 인접 보호 영역 침범 ${audit.neighborCriticalZoneCollisionCount}건`)}</text>`,
    `</svg>`,
  ].join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 웹툰 컷 연출 감독 QA 브리프를 생성한다.
 */
export function summarizePanelBreakoutLayoutKo(
  compiled: CompiledPanelBreakoutLayout,
  audit: BreakoutCollisionAudit,
  solveResult?: CollisionFreeBreakoutSolveResult,
): PanelBreakoutQaBriefKo {
  const verdictKo: PanelBreakoutQaBriefKo["verdictKo"] =
    audit.verdict === "pass" ? "통과" : audit.verdict === "warn" ? "주의" : "교정 필요";

  const styleCounts = new Map<string, number>();
  for (let i = 0; i < compiled.panels.length; i += 1) {
    const panel = compiled.panels[i];
    if (!panel) continue;
    const label = PANEL_FRAME_STYLES[panel.style].labelKo;
    styleCounts.set(label, (styleCounts.get(label) ?? 0) + 1);
  }
  const styleBreakdown = Array.from(styleCounts.entries())
    .map(([label, count]) => `${label} ${count}개`)
    .join(", ");

  const headlineKo = audit.passed
    ? `컷 돌출 검수 ${verdictKo} — 인접 컷 얼굴·말풍선 침범 0건, 좌우 캔버스 잘림 위반 0건입니다.`
    : `컷 돌출 검수 ${verdictKo} — 인접 컷 침범 ${audit.neighborCriticalZoneCollisionCount}건, 좌우 캔버스 잘림 ${audit.canvasHorizontalClipViolationCount}건을 바로잡아야 합니다.`;

  const panelSummaryLineKo =
    compiled.panels.length > 0
      ? `전체 ${compiled.panels.length}개 컷(${styleBreakdown})을 캔버스 폭 ${Math.round(compiled.canvasWidthPx)}px 기준으로 컴파일했습니다.`
      : `등록된 컷이 없어 빈 캔버스(폭 ${Math.round(compiled.canvasWidthPx)}px) 상태로 검수를 마쳤습니다.`;

  const breakoutSummaryLineKo =
    compiled.totalBreakoutSubjectCount > 0
      ? `돌출 피사체 ${compiled.totalBreakoutSubjectCount}개가 테두리 위 Z-오더로 승격되어 총 ${Math.round(compiled.totalBreakoutOverflowAreaPx2).toLocaleString("en-US")}px²만큼 거터 위로 튀어나왔습니다.`
      : `테두리 밖으로 돌출하는 피사체 없이 모든 원화가 컷 경계 안에 깔끔하게 잘렸습니다.`;

  const collisionSummaryLineKo = audit.passed
    ? `최대 좌우 캔버스 이탈 비율은 ${(audit.maxHorizontalClipRatioObserved * 100).toFixed(1)}%로 허용 상한(${(compiled.maxHorizontalClipRatio * 100).toFixed(0)}%) 이내입니다.`
    : `인접 컷 핵심 영역 침범 ${audit.neighborCriticalZoneCollisionCount}건, 좌우 캔버스 ${(compiled.maxHorizontalClipRatio * 100).toFixed(0)}% 초과 잘림 ${audit.canvasHorizontalClipViolationCount}건이 발견됐습니다.`;

  let solverSummaryLineKo: string | null = null;
  if (solveResult) {
    if (solveResult.iterationsUsed === 0 && solveResult.horizontalClamps.length === 0) {
      solverSummaryLineKo = "초기 배치부터 충돌이 없어 거터 간격과 피사체 위치를 그대로 유지했습니다.";
    } else {
      solverSummaryLineKo = `자동 거터 확장(${Math.round(solveResult.totalAddedGutterPx)}px 추가)과 수평 안전 보정(${solveResult.horizontalClamps.length}건)으로 모든 충돌을 없앴습니다.`;
    }
  }

  const actionLinesKo: string[] = [];
  for (let i = 0; i < audit.neighborCriticalZoneCollisions.length; i += 1) {
    const col = audit.neighborCriticalZoneCollisions[i];
    if (!col) continue;
    actionLinesKo.push(
      `[${col.ownerPanelId}] '${col.subjectLabelKo}' 돌출부가 [${col.neighborPanelId}] '${col.zoneLabelKo}'와 ${Math.round(col.overlapAreaPx2)}px² 겹칩니다. 세로 거터를 최소 ${Math.ceil(col.requiredVerticalShiftPx + 16)}px 넓히세요.`,
    );
  }
  for (let i = 0; i < audit.canvasHorizontalClipViolations.length; i += 1) {
    const vio = audit.canvasHorizontalClipViolations[i];
    if (!vio) continue;
    actionLinesKo.push(
      `[${vio.panelId}] '${vio.subjectLabelKo}'가 캔버스 밖으로 ${(vio.clippedOutsideRatio * 100).toFixed(1)}% 잘려 나갑니다. 안쪽으로 수평 이동해 10% 이내로 맞추세요.`,
    );
  }
  if (audit.zeroOverflowBreakoutSubjectIds.length > 0) {
    actionLinesKo.push(
      `돌출 모드로 지정됐지만 테두리 밖으로 나오지 않은 피사체(${audit.zeroOverflowBreakoutSubjectIds.join(", ")})의 좌표를 확인하세요.`,
    );
  }
  if (actionLinesKo.length === 0) {
    actionLinesKo.push("추가 교정 항목 없이 바로 원고 출력과 연재 내보내기를 진행해도 됩니다.");
  }

  const lines = [
    headlineKo,
    `- ${panelSummaryLineKo}`,
    `- ${breakoutSummaryLineKo}`,
    `- ${collisionSummaryLineKo}`,
    ...(solverSummaryLineKo ? [`- ${solverSummaryLineKo}`] : []),
    ...actionLinesKo.map((line) => `- 조치: ${line}`),
    `- 지문: SHA-256 ${compiled.manifestSha256Hex.slice(0, 16)}`,
  ];

  return {
    verdictKo,
    headlineKo,
    panelSummaryLineKo,
    breakoutSummaryLineKo,
    collisionSummaryLineKo,
    solverSummaryLineKo,
    actionLinesKo,
    fullTextKo: lines.join("\n"),
  };
}
