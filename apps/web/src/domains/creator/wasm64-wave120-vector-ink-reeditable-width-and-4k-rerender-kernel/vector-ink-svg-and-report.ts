/**
 * Wave 120 — 인쇄 안전 순수 OKLCH 비교 검수 SVG 렌더러 및 한국어 선화 감독 QA 브리프.
 *
 * - SVG 내부의 모든 색상은 CSS Color 4 `oklch(...)` 토큰만 사용해 원시 16진수/RGB/HSL 표기를 배제한다.
 * - 교차점 지우개 전/후 스트로크 비교, 선폭 조각 영역 표시, 1x 래스터 확대 vs 4K/600DPI SDF 재렌더링
 *   선명도 비교 막대를 한 화면에 시각화한다.
 * - 모든 수치 좌표에 유한수 가드(`0` NaN/Infinity)를 적용하고 모든 텍스트에 XML 이스케이프를 적용한다.
 */

import {
  clampFinite,
  computeStrokeTotalLength,
  computeVectorInkLayerSha256Hex,
  evaluateEffectiveStrokeWidth,
  extractStrokeSegments,
  type VectorInkLayer,
  type VectorInkStroke,
  type WidthSculptResult,
} from "./vector-ink-stroke-and-width-sculpt";
import type {
  VectorIntersectionEraseResult,
  VectorIntersectionEraseStatus,
} from "./vector-intersection-eraser";
import type { VectorVsRasterUpscaleComparison } from "./vector-ink-sdf-rerender-and-wgsl";

export interface VectorInkAuditSvgOptions {
  readonly titleOverrideKo?: string;
  readonly eraserResult?: VectorIntersectionEraseResult;
  readonly sculptZone?: {
    readonly centerX: number;
    readonly centerY: number;
    readonly brushRadiusPx: number;
    readonly modeLabelKo?: string;
  };
}

export interface VectorInkKoreanSummaryOptions {
  readonly sculptResult?: WidthSculptResult;
  readonly inspectedDateIso?: string;
}

const OKLCH_PALETTE = {
  canvasBg: "oklch(0.980 0.007 90)",
  cardBg: "oklch(1.000 0.000 0)",
  headerBg: "oklch(0.952 0.011 88)",
  stageBg: "oklch(0.992 0.004 92)",
  borderSoft: "oklch(0.320 0.040 158 / 0.22)",
  borderStrong: "oklch(0.280 0.052 158 / 0.45)",
  inkPrimary: "oklch(0.210 0.030 160)",
  inkSecondary: "oklch(0.410 0.025 160)",
  inkStrokeDefault: "oklch(0.165 0.018 250)",
  inkStrokeBeforeFade: "oklch(0.560 0.170 28 / 0.42)",
  cutMarkerFill: "oklch(0.935 0.055 152)",
  cutMarkerStroke: "oklch(0.430 0.130 152)",
  sculptZoneFill: "oklch(0.860 0.085 75 / 0.24)",
  sculptZoneStroke: "oklch(0.550 0.155 62)",
  vectorBarFill: "oklch(0.420 0.115 154)",
  rasterBarFill: "oklch(0.680 0.045 250)",
  barTrackBg: "oklch(0.940 0.008 90)",
  passFill: "oklch(0.932 0.048 152)",
  passStroke: "oklch(0.425 0.120 152)",
  passText: "oklch(0.250 0.080 152)",
  warnFill: "oklch(0.935 0.058 32)",
  warnStroke: "oklch(0.540 0.175 28)",
  warnText: "oklch(0.320 0.120 28)",
  gridLine: "oklch(0.380 0.020 160 / 0.14)",
} as const;

const ERASER_STATUS_LABEL_KO: Readonly<Record<VectorIntersectionEraseStatus, string>> = {
  "trimmed-start-tail": "시작단 돌출 자투리 정밀 절단",
  "trimmed-end-tail": "끝단 돌출 자투리 정밀 절단",
  "split-middle-bridge": "교차점 사이 중간 구간 분리 절단",
  "opened-closed-loop": "닫힌 외곽선 클릭 호 개방 절단",
  "whole-stroke-removed": "교차 없는 단독 획 전체 삭제",
  "stroke-not-found": "대상 획 미발견(변경 없음)",
  "click-too-far": "클릭 위치 허용 반경 초과(변경 없음)",
};

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeVectorInkXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtSvgNum(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  const rounded = Math.round(safe * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function sanitizeOklchColor(candidate: string | undefined, fallback: string): string {
  if (!candidate) {
    return fallback;
  }
  const trimmed = candidate.trim();
  if (/^oklch\(\s*[0-9.]+\s+[0-9.]+\s+[0-9.]+(?:\s*\/\s*[0-9.]+%?)?\s*\)$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function renderStrokeSegmentsSvg(
  stroke: VectorInkStroke,
  offsetX: number,
  offsetY: number,
  scale: number,
  colorOverride?: string,
): readonly string[] {
  const segments = extractStrokeSegments(stroke);
  if (segments.length === 0) {
    return [];
  }
  const totalLength = computeStrokeTotalLength(stroke);
  const strokeColor = colorOverride ?? sanitizeOklchColor(stroke.colorOklch, OKLCH_PALETTE.inkStrokeDefault);
  const opacity = clampFinite(stroke.opacity ?? 1, 0, 1, 1);
  const lines: string[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const midS = (seg.startS + seg.endS) * 0.5;
    const midWidth = evaluateEffectiveStrokeWidth(
      (seg.p0.widthPx + seg.p1.widthPx) * 0.5,
      midS,
      totalLength,
      stroke.taperStartPx,
      stroke.taperEndPx,
      stroke.closed,
    );
    const x1 = offsetX + seg.p0.x * scale;
    const y1 = offsetY + seg.p0.y * scale;
    const x2 = offsetX + seg.p1.x * scale;
    const y2 = offsetY + seg.p1.y * scale;
    const sw = clampFinite(midWidth * scale, 0.5, 48, 1.5);
    lines.push(
      `    <line x1="${fmtSvgNum(x1)}" y1="${fmtSvgNum(y1)}" x2="${fmtSvgNum(x2)}" y2="${fmtSvgNum(y2)}" stroke="${strokeColor}" stroke-width="${fmtSvgNum(sw)}" stroke-linecap="round" stroke-opacity="${fmtSvgNum(opacity, 1)}" />`,
    );
  }
  return lines;
}

function renderLayerStagePanel(
  layer: VectorInkLayer,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
  titleKo: string,
  subtitleKo: string,
  extraLines: readonly string[],
): { readonly lines: readonly string[]; readonly stageX: number; readonly stageY: number; readonly stageScale: number } {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtSvgNum(panelX)}" y="${fmtSvgNum(panelY)}" width="${fmtSvgNum(panelW)}" height="${fmtSvgNum(panelH)}" rx="10" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtSvgNum(panelX + 14)}" y="${fmtSvgNum(panelY + 24)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="13" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeVectorInkXml(titleKo)}</text>`,
  );
  out.push(
    `  <text x="${fmtSvgNum(panelX + 14)}" y="${fmtSvgNum(panelY + 41)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.inkSecondary}">${escapeVectorInkXml(subtitleKo)}</text>`,
  );

  const stagePad = 14;
  const stageX = panelX + stagePad;
  const stageY = panelY + 52;
  const stageW = panelW - stagePad * 2;
  const stageH = panelH - 66;

  out.push(
    `  <rect x="${fmtSvgNum(stageX)}" y="${fmtSvgNum(stageY)}" width="${fmtSvgNum(stageW)}" height="${fmtSvgNum(stageH)}" rx="6" fill="${OKLCH_PALETTE.stageBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );

  // 인쇄 검수용 미세 격자선
  for (let gx = 1; gx <= 3; gx += 1) {
    const lx = stageX + (stageW * gx) / 4;
    out.push(
      `  <line x1="${fmtSvgNum(lx)}" y1="${fmtSvgNum(stageY)}" x2="${fmtSvgNum(lx)}" y2="${fmtSvgNum(stageY + stageH)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" />`,
    );
  }
  for (let gy = 1; gy <= 3; gy += 1) {
    const ly = stageY + (stageH * gy) / 4;
    out.push(
      `  <line x1="${fmtSvgNum(stageX)}" y1="${fmtSvgNum(ly)}" x2="${fmtSvgNum(stageX + stageW)}" y2="${fmtSvgNum(ly)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" />`,
    );
  }

  const layerW = Math.max(1, clampFinite(layer.widthPx, 1, 8192, 100));
  const layerH = Math.max(1, clampFinite(layer.heightPx, 1, 8192, 100));
  const stageScale = Math.min((stageW - 16) / layerW, (stageH - 16) / layerH);
  const drawOriginX = stageX + (stageW - layerW * stageScale) * 0.5;
  const drawOriginY = stageY + (stageH - layerH * stageScale) * 0.5;

  out.push(`  <g data-layer-id="${escapeVectorInkXml(layer.layerId)}">`);
  for (let i = 0; i < layer.strokes.length; i += 1) {
    const strokeLines = renderStrokeSegmentsSvg(layer.strokes[i], drawOriginX, drawOriginY, stageScale);
    for (let k = 0; k < strokeLines.length; k += 1) {
      out.push(strokeLines[k]);
    }
  }
  for (let i = 0; i < extraLines.length; i += 1) {
    out.push(extraLines[i]);
  }
  out.push("  </g>");

  return { lines: out, stageX: drawOriginX, stageY: drawOriginY, stageScale };
}

/**
 * 교차점 지우개·선폭 조각 전/후 결과와 1x vs 4K/600DPI SDF 재렌더링 선명도 우위를
 * 순수 OKLCH 인쇄 안전 검수 SVG로 렌더링한다.
 */
export function renderVectorInkReeditAuditSvg(
  beforeLayer: VectorInkLayer,
  afterLayer: VectorInkLayer,
  comparison: VectorVsRasterUpscaleComparison,
  options?: VectorInkAuditSvgOptions,
): string {
  const totalW = 920;
  const totalH = 540;
  const padX = 24;
  const padY = 20;
  const headerH = 64;
  const panelW = 424;
  const panelH = 266;
  const panelGap = 24;
  const panelsY = padY + headerH + 18;
  const chartY = panelsY + panelH + 18;
  const chartH = 132;

  const beforeDigest = computeVectorInkLayerSha256Hex(beforeLayer).slice(0, 12);
  const afterDigest = computeVectorInkLayerSha256Hex(afterLayer).slice(0, 12);
  const titleText =
    options?.titleOverrideKo ??
    `Wave 120 벡터 먹선 비파괴 재편집 · 4K/600DPI 재렌더링 검수 (${beforeLayer.layerId})`;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(totalW)}" height="${String(totalH)}" viewBox="0 0 ${String(totalW)} ${String(totalH)}" role="img" aria-label="${escapeVectorInkXml(titleText)}">`,
  );
  lines.push(`  <title>${escapeVectorInkXml(titleText)}</title>`);
  lines.push(
    `  <rect x="0" y="0" width="${String(totalW)}" height="${String(totalH)}" fill="${OKLCH_PALETTE.canvasBg}" />`,
  );

  // 상단 헤더 바
  lines.push(
    `  <rect x="${String(padX)}" y="${String(padY)}" width="${String(totalW - padX * 2)}" height="${String(headerH)}" rx="10" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${String(padX + 16)}" y="${String(padY + 27)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="15" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeVectorInkXml(titleText)}</text>`,
  );
  const ratioText = Number.isFinite(comparison.sharpnessAdvantageRatio)
    ? `${comparison.sharpnessAdvantageRatio.toFixed(2)}x`
    : "∞";
  const headerSub = `원본 SHA ${beforeDigest} → 편집 SHA ${afterDigest} · 목표 ${String(comparison.targetDpi)} DPI (${String(comparison.upscaleFactor)}배) · 선명도 우위 ${ratioText}`;
  lines.push(
    `  <text x="${String(padX + 16)}" y="${String(padY + 48)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" fill="${OKLCH_PALETTE.inkSecondary}">${escapeVectorInkXml(headerSub)}</text>`,
  );

  // 합격/보정 배지
  const badgeX = totalW - padX - 134;
  const badgeY = padY + 18;
  const gatePass = comparison.passedAdvantageGate;
  lines.push(
    `  <rect x="${String(badgeX)}" y="${String(badgeY)}" width="118" height="28" rx="6" fill="${gatePass ? OKLCH_PALETTE.passFill : OKLCH_PALETTE.warnFill}" stroke="${gatePass ? OKLCH_PALETTE.passStroke : OKLCH_PALETTE.warnStroke}" stroke-width="1.2" />`,
  );
  lines.push(
    `  <text x="${String(badgeX + 59)}" y="${String(badgeY + 18)}" text-anchor="middle" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" font-weight="700" fill="${gatePass ? OKLCH_PALETTE.passText : OKLCH_PALETTE.warnText}">${gatePass ? "4K 재렌더링 합격" : "선명도 재확인"}</text>`,
  );

  // 좌측 패널: 편집 전 원본
  const leftMeta = renderLayerStagePanel(
    beforeLayer,
    padX,
    panelsY,
    panelW,
    panelH,
    "편집 전 · 원본 가변 필압 벡터 먹선",
    `획 ${String(beforeLayer.strokes.length)}개 · 기준 ${String(beforeLayer.dpi)} DPI · SHA ${beforeDigest}`,
    [],
  );
  for (let i = 0; i < leftMeta.lines.length; i += 1) {
    lines.push(leftMeta.lines[i]);
  }

  // 우측 패널: 편집 후 결과 + 교차 절단점/선폭 조각 브러시 표시
  const rightExtra: string[] = [];
  const rightLayerW = Math.max(1, clampFinite(afterLayer.widthPx, 1, 8192, 100));
  const rightLayerH = Math.max(1, clampFinite(afterLayer.heightPx, 1, 8192, 100));
  const stageW = panelW - 28;
  const stageH = panelH - 66;
  const rScale = Math.min((stageW - 16) / rightLayerW, (stageH - 16) / rightLayerH);
  const rOriginX = padX + panelW + panelGap + 14 + (stageW - rightLayerW * rScale) * 0.5;
  const rOriginY = panelsY + 52 + (stageH - rightLayerH * rScale) * 0.5;

  // 제거 전 잔상(고스트) 표시: 편집 전 대상 획이 있다면 옅은 경고 OKLCH로 표시
  if (options?.eraserResult) {
    const removedBefore = beforeLayer.strokes.find(
      (s) => s.id === options.eraserResult?.targetStrokeId,
    );
    if (removedBefore) {
      const ghostLines = renderStrokeSegmentsSvg(
        removedBefore,
        rOriginX,
        rOriginY,
        rScale,
        OKLCH_PALETTE.inkStrokeBeforeFade,
      );
      for (let g = 0; g < ghostLines.length; g += 1) {
        rightExtra.push(ghostLines[g]);
      }
    }
    const hits = [options.eraserResult.cutStartHit, options.eraserResult.cutEndHit];
    for (let h = 0; h < hits.length; h += 1) {
      const hit = hits[h];
      if (!hit) continue;
      const hx = rOriginX + hit.x * rScale;
      const hy = rOriginY + hit.y * rScale;
      rightExtra.push(
        `    <circle cx="${fmtSvgNum(hx)}" cy="${fmtSvgNum(hy)}" r="5.5" fill="${OKLCH_PALETTE.cutMarkerFill}" stroke="${OKLCH_PALETTE.cutMarkerStroke}" stroke-width="1.8" />`,
      );
    }
  }

  if (options?.sculptZone) {
    const sx = rOriginX + options.sculptZone.centerX * rScale;
    const sy = rOriginY + options.sculptZone.centerY * rScale;
    const sr = clampFinite(options.sculptZone.brushRadiusPx * rScale, 4, 160, 18);
    rightExtra.push(
      `    <circle cx="${fmtSvgNum(sx)}" cy="${fmtSvgNum(sy)}" r="${fmtSvgNum(sr)}" fill="${OKLCH_PALETTE.sculptZoneFill}" stroke="${OKLCH_PALETTE.sculptZoneStroke}" stroke-width="1.4" stroke-dasharray="4 3" />`,
    );
  }

  const rightSubtitle = options?.eraserResult
    ? `획 ${String(afterLayer.strokes.length)}개 · ${ERASER_STATUS_LABEL_KO[options.eraserResult.status]} · 잔여 오차 ${options.eraserResult.residualOvershootPx.toExponential(1)}px`
    : `획 ${String(afterLayer.strokes.length)}개 · 비파괴 재편집 완료 · SHA ${afterDigest}`;

  const rightMeta = renderLayerStagePanel(
    afterLayer,
    padX + panelW + panelGap,
    panelsY,
    panelW,
    panelH,
    "편집 후 · 교차 절단 · 부분 선폭 조각",
    rightSubtitle,
    rightExtra,
  );
  for (let i = 0; i < rightMeta.lines.length; i += 1) {
    lines.push(rightMeta.lines[i]);
  }

  // 하단 1x 래스터 확대 vs 4K/600DPI SDF 재렌더링 선명도 비교 카드
  lines.push(
    `  <rect x="${String(padX)}" y="${String(chartY)}" width="${String(totalW - padX * 2)}" height="${String(chartH)}" rx="10" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${String(padX + 16)}" y="${String(chartY + 25)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="13" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">${escapeVectorInkXml(`해상도 독립 ${String(comparison.upscaleFactor)}x (${String(comparison.targetDpi)} DPI) SDF 직접 재렌더링 vs 래스터 바이리니어 확대 선명도`)}</text>`,
  );

  const maxAcutance = Math.max(
    0.05,
    comparison.vectorEdgeAcutance,
    comparison.rasterUpscaleEdgeAcutance,
  );
  const trackX = padX + 228;
  const trackW = 460;
  const vecBarW = clampFinite((comparison.vectorEdgeAcutance / maxAcutance) * trackW, 4, trackW, 4);
  const rasBarW = clampFinite(
    (comparison.rasterUpscaleEdgeAcutance / maxAcutance) * trackW,
    4,
    trackW,
    4,
  );

  // 벡터 SDF 막대
  const row1Y = chartY + 46;
  lines.push(
    `  <text x="${String(padX + 16)}" y="${String(row1Y + 15)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">벡터 SDF 직접 재렌더링 (${String(comparison.upscaleFactor)}x)</text>`,
  );
  lines.push(
    `  <rect x="${String(trackX)}" y="${String(row1Y)}" width="${String(trackW)}" height="22" rx="5" fill="${OKLCH_PALETTE.barTrackBg}" />`,
  );
  lines.push(
    `  <rect x="${String(trackX)}" y="${String(row1Y)}" width="${fmtSvgNum(vecBarW)}" height="22" rx="5" fill="${OKLCH_PALETTE.vectorBarFill}" />`,
  );
  lines.push(
    `  <text x="${String(trackX + trackW + 12)}" y="${String(row1Y + 15)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">선명도 ${comparison.vectorEdgeAcutance.toFixed(3)} · 번짐 ${comparison.vectorTransitionBandPx.toFixed(2)}px</text>`,
  );

  // 래스터 바이리니어 확대 막대
  const row2Y = chartY + 80;
  lines.push(
    `  <text x="${String(padX + 16)}" y="${String(row2Y + 15)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" fill="${OKLCH_PALETTE.inkSecondary}">1x 래스터 바이리니어 확대 (${String(comparison.upscaleFactor)}x)</text>`,
  );
  lines.push(
    `  <rect x="${String(trackX)}" y="${String(row2Y)}" width="${String(trackW)}" height="22" rx="5" fill="${OKLCH_PALETTE.barTrackBg}" />`,
  );
  lines.push(
    `  <rect x="${String(trackX)}" y="${String(row2Y)}" width="${fmtSvgNum(rasBarW)}" height="22" rx="5" fill="${OKLCH_PALETTE.rasterBarFill}" />`,
  );
  lines.push(
    `  <text x="${String(trackX + trackW + 12)}" y="${String(row2Y + 15)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="11" fill="${OKLCH_PALETTE.inkSecondary}">선명도 ${comparison.rasterUpscaleEdgeAcutance.toFixed(3)} · 번짐 ${comparison.rasterUpscaleTransitionBandPx.toFixed(2)}px</text>`,
  );

  lines.push(
    `  <text x="${String(padX + 16)}" y="${String(chartY + 120)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.inkSecondary}">${escapeVectorInkXml(`선명도 우위 ${ratioText} (합격 기준 1.80x 초과) · 경계 번짐 축소 ${comparison.transitionTighteningRatio.toFixed(2)}배 · 출력 ${String(comparison.targetWidth)}×${String(comparison.targetHeight)}px`)}</text>`,
  );

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 교차점 지우개 결과와 4K/600DPI SDF 재렌더링 비교 수치를 바탕으로
 * 번역투 없는 자연스러운 한국어 선화 감독 QA 브리프를 생성한다.
 */
export function summarizeVectorInkKernelKo(
  eraserResult: VectorIntersectionEraseResult,
  comparison: VectorVsRasterUpscaleComparison,
  options?: VectorInkKoreanSummaryOptions,
): string {
  const statusLabel = ERASER_STATUS_LABEL_KO[eraserResult.status];
  const residualText = eraserResult.residualOvershootPx.toFixed(4);
  const removedText = eraserResult.removedSpanPx.toFixed(2);
  const ratioText = Number.isFinite(comparison.sharpnessAdvantageRatio)
    ? comparison.sharpnessAdvantageRatio.toFixed(2)
    : "∞";

  const lines: string[] = [];
  lines.push("Wave 120 벡터 먹선 선화 감독 QA 브리프");
  if (options?.inspectedDateIso) {
    lines.push(`검수 일자: ${options.inspectedDateIso}`);
  }

  // 교차점 지우개 요약
  if (eraserResult.status === "trimmed-end-tail" || eraserResult.status === "trimmed-start-tail") {
    lines.push(
      `교차점 지우개: 대상 획 '${eraserResult.targetStrokeId}'에서 ${statusLabel} 완료 (제거 길이 ${removedText}px, 잔여 돌출 오차 ${residualText}px, 교차 기준점 ${String(eraserResult.intersections.length)}곳).`,
    );
  } else if (eraserResult.status === "split-middle-bridge") {
    lines.push(
      `교차점 지우개: 대상 획 '${eraserResult.targetStrokeId}'의 교차점 사이 중간 구간(${removedText}px)을 도려내 독립 획 ${String(eraserResult.resultingStrokes.length)}개로 분리했고, 절단면 선폭을 그대로 유지했습니다(잔여 오차 ${residualText}px).`,
    );
  } else if (eraserResult.status === "opened-closed-loop") {
    lines.push(
      `교차점 지우개: 닫힌 외곽선 '${eraserResult.targetStrokeId}'에서 클릭한 호(${removedText}px)를 열어 단일 열린 획으로 정리했습니다(잔여 오차 ${residualText}px).`,
    );
  } else if (eraserResult.status === "whole-stroke-removed") {
    lines.push(
      `교차점 지우개: 교차점이 없는 단독 획 '${eraserResult.targetStrokeId}'(${removedText}px)을 깨끗하게 지웠습니다.`,
    );
  } else {
    lines.push(
      `교차점 지우개: 대상 획 '${eraserResult.targetStrokeId}'은 ${statusLabel} 상태로 원본 레이어를 그대로 유지했습니다.`,
    );
  }

  // 선택적 선폭 조각 요약
  if (options?.sculptResult) {
    const s = options.sculptResult;
    lines.push(
      `부분 선폭 조각(${s.mode}): 반경 내 제어점 ${String(s.affectedPointCount)}개 조정(최대 변화 ${s.maxAbsoluteDeltaPx.toFixed(2)}px), 반경 밖 원거리 제어점 ${String(s.untouchedPointCount)}개 변동 0.00px 보존.`,
    );
  }

  // 4K/600DPI SDF 재렌더링 비교 요약
  const verdictKo = comparison.passedAdvantageGate ? "합격" : "기준 미달(재검토 필요)";
  lines.push(
    `해상도 독립 재렌더링(${String(comparison.upscaleFactor)}배 · ${String(comparison.targetDpi)} DPI): 벡터 SDF 에지 선명도 ${comparison.vectorEdgeAcutance.toFixed(3)} 대 래스터 확대 ${comparison.rasterUpscaleEdgeAcutance.toFixed(3)}로 ${ratioText}배 우위를 기록했습니다.`,
  );
  lines.push(
    `경계 번짐 폭: 벡터 SDF ${comparison.vectorTransitionBandPx.toFixed(2)}px vs 래스터 확대 ${comparison.rasterUpscaleTransitionBandPx.toFixed(2)}px (번짐 ${comparison.transitionTighteningRatio.toFixed(2)}배 축소) — 최종 판정: ${verdictKo}.`,
  );
  lines.push(
    `무결성 지문(SHA-256): 편집 전 ${eraserResult.beforeSha256.slice(0, 16)} → 편집 후 ${eraserResult.afterSha256.slice(0, 16)}.`,
  );

  return lines.join("\n");
}
