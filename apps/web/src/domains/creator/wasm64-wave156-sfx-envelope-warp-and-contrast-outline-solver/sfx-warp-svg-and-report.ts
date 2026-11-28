/**
 * Wave 156 — 순수 OKLCH SFX Coons 워프·이중 링 대비 비교 SVG 렌더러 및
 * 자연스러운 한국어 레터링 감독 QA 브리프 생성기.
 *
 * - SVG 전체에 원시 hex/rgb/hsl 색상 문자열을 전혀 쓰지 않고 순수 `oklch(...)`만 사용
 * - XML/XSS 특수문자(`&`, `<`, `>`, `"`, `'`) 완전 이스케이프 및 모든 좌표 유한수 가드
 * - 번역투 없는 실무 한국어 레터링 검수 리포트 생성
 */

import {
  clampFinite,
  evaluateCoonsPatchPoint,
  SFX_ENVELOPE_PRESET_META,
  type Vec2,
  type WarpedSfxTextResult,
} from "./sfx-coons-envelope-warp";
import {
  computeSfxManifestFingerprint,
  type AdaptiveSfxOutlineSolution,
} from "./sfx-contrast-outline-solver";
import type { SfxSdfOutlineWgslValidationReport } from "./sfx-sdf-outline-wgsl";

export type SfxAuditGrade = "PASS" | "WARN" | "FAIL";

export interface RenderSfxEnvelopeAuditSvgInput {
  readonly warped: WarpedSfxTextResult;
  readonly outline: AdaptiveSfxOutlineSolution;
  readonly wgslValidation?: SfxSdfOutlineWgslValidationReport;
  readonly titleKo?: string;
  readonly subtitleKo?: string;
  readonly artistNoteKo?: string;
  readonly manifestHash?: string;
}

export interface SfxAuditCheckItem {
  readonly id: string;
  readonly labelKo: string;
  readonly passed: boolean;
  readonly measuredText: string;
  readonly thresholdText: string;
  readonly detailKo: string;
}

export interface SummarizeSfxEnvelopeAuditInput {
  readonly warped: WarpedSfxTextResult;
  readonly outline: AdaptiveSfxOutlineSolution;
  readonly wgslValidation: SfxSdfOutlineWgslValidationReport;
  readonly artistNoteKo?: string;
  readonly generatedDateIso?: string;
}

export interface SfxEnvelopeAuditBriefKo {
  readonly grade: SfxAuditGrade;
  readonly passed: boolean;
  readonly sfxManifestSha256Hex: string;
  readonly sfxText: string;
  readonly presetLabelKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly bulletLinesKo: readonly string[];
  readonly checks: readonly SfxAuditCheckItem[];
}

const SVG_OKLCH = {
  pageBg: "oklch(0.978 0.008 88)",
  panelBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.955 0.011 86)",
  stageFrame: "oklch(0.942 0.010 88)",
  borderSoft: "oklch(0.320 0.032 156 / 0.22)",
  borderStrong: "oklch(0.280 0.045 156 / 0.44)",
  gridUvLine: "oklch(0.920 0.025 90 / 0.46)",
  boundaryTop: "oklch(0.620 0.175 28)",
  boundaryBottom: "oklch(0.560 0.165 250)",
  boundarySide: "oklch(0.680 0.155 145)",
  foldCellFill: "oklch(0.560 0.220 25 / 0.48)",
  dropShadow: "oklch(0.140 0.020 260 / 0.56)",
  inkPrimary: "oklch(0.215 0.036 156)",
  inkSecondary: "oklch(0.415 0.024 156)",
  inkMuted: "oklch(0.525 0.018 156)",
  accentForest: "oklch(0.345 0.078 156)",
  barTrack: "oklch(0.920 0.012 90)",
  barFill: "oklch(0.440 0.115 156)",
  passFill: "oklch(0.935 0.044 152)",
  passStroke: "oklch(0.420 0.112 152)",
  passText: "oklch(0.255 0.075 152)",
  warnFill: "oklch(0.945 0.062 78)",
  warnStroke: "oklch(0.545 0.142 68)",
  warnText: "oklch(0.325 0.092 62)",
  failFill: "oklch(0.932 0.056 24)",
  failStroke: "oklch(0.515 0.182 26)",
  failText: "oklch(0.310 0.122 26)",
} as const;

const FONT_SANS = "Pretendard, Apple SD Gothic Neo, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, monospace";

/** SVG/XML 텍스트 노드의 XSS·구문 파손 문자를 안전하게 이스케이프한다. */
export function escapeSvgXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtNum(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(digits);
}

function resolvePresetLabelKo(presetId: WarpedSfxTextResult["presetId"]): string {
  if (presetId === "custom") {
    return "사용자 정의 Coons 패치";
  }
  return SFX_ENVELOPE_PRESET_META[presetId].labelKo;
}

interface StageTransform {
  readonly mapPoint: (p: Vec2) => Vec2;
  readonly scale: number;
}

function buildStageTransform(
  warped: WarpedSfxTextResult,
  stageX: number,
  stageY: number,
  stageW: number,
  stageH: number,
  margin: number,
): StageTransform {
  const bb = warped.boundingBox;
  const srcW = Math.max(1, bb.width);
  const srcH = Math.max(1, bb.height);
  const availW = Math.max(16, stageW - 2 * margin);
  const availH = Math.max(16, stageH - 2 * margin);
  const scale = Math.min(availW / srcW, availH / srcH);
  const offsetX = stageX + margin + (availW - srcW * scale) * 0.5 - bb.minX * scale;
  const offsetY = stageY + margin + (availH - srcH * scale) * 0.5 - bb.minY * scale;

  return {
    scale,
    mapPoint: (p: Vec2): Vec2 => ({
      x: offsetX + p.x * scale,
      y: offsetY + p.y * scale,
    }),
  };
}

function pointsToSvgPath(points: readonly Vec2[], closed: boolean): string {
  if (points.length === 0) return "";
  const parts: string[] = [`M ${fmtNum(points[0].x)} ${fmtNum(points[0].y)}`];
  for (let i = 1; i < points.length; i += 1) {
    parts.push(`L ${fmtNum(points[i].x)} ${fmtNum(points[i].y)}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function buildStatusBadgeSvg(
  x: number,
  y: number,
  w: number,
  labelKo: string,
  tone: "pass" | "warn" | "fail",
): string {
  const fill =
    tone === "pass"
      ? SVG_OKLCH.passFill
      : tone === "warn"
        ? SVG_OKLCH.warnFill
        : SVG_OKLCH.failFill;
  const stroke =
    tone === "pass"
      ? SVG_OKLCH.passStroke
      : tone === "warn"
        ? SVG_OKLCH.warnStroke
        : SVG_OKLCH.failStroke;
  const text =
    tone === "pass"
      ? SVG_OKLCH.passText
      : tone === "warn"
        ? SVG_OKLCH.warnText
        : SVG_OKLCH.failText;
  return [
    `<rect x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(w)}" height="28" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`,
    `<text x="${fmtNum(x + w * 0.5)}" y="${fmtNum(y + 18)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="12" font-weight="700" fill="${text}">${escapeSvgXml(labelKo)}</text>`,
  ].join("");
}

/**
 * Coons 패치 UV 격자, 워프된 SFX 글리프 실루엣, 다중 링 대비 아웃라인,
 * 야코비안 접힘 안전 배지 및 무아웃라인 대비 비교를 순수 `oklch(...)` SVG로 렌더링한다.
 */
export function renderSfxEnvelopeAuditSvg(
  input: RenderSfxEnvelopeAuditSvgInput,
): string {
  const { warped, outline, wgslValidation } = input;
  const presetLabelKo = resolvePresetLabelKo(warped.presetId);
  const titleKo =
    input.titleKo ??
    `웹툰 효과음(SFX) Coons 워프 · 이중 링 대비 검수 시트`;
  const subtitleKo =
    input.subtitleKo ??
    `효과음 "${warped.text}" · ${presetLabelKo} · 글리프 ${String(warped.glyphs.length)}자`;
  const manifestHash =
    input.manifestHash ??
    computeSfxManifestFingerprint({
      text: warped.text,
      presetId: warped.presetId,
      envelope: warped.envelope,
      outline,
    }).sfxManifestSha256Hex;

  const width = 1200;
  const height = 780;

  // 메인 Coons 스테이지 좌표
  const stageX = 32;
  const stageY = 114;
  const stageW = 1136;
  const stageH = 340;
  const stageTf = buildStageTransform(warped, stageX, stageY, stageW, stageH, 38);

  const elements: string[] = [];
  elements.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}" role="img" aria-label="${escapeSvgXml(titleKo)}">`,
  );

  // 배경 페이지 및 헤더 패널
  elements.push(`<rect x="0" y="0" width="${String(width)}" height="${String(height)}" fill="${SVG_OKLCH.pageBg}"/>`);
  elements.push(`<rect x="20" y="16" width="1160" height="82" rx="14" fill="${SVG_OKLCH.headerBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1.2"/>`);
  elements.push(`<text x="38" y="48" font-family="${FONT_SANS}" font-size="20" font-weight="700" fill="${SVG_OKLCH.inkPrimary}">${escapeSvgXml(titleKo)}</text>`);
  elements.push(`<text x="38" y="74" font-family="${FONT_SANS}" font-size="13" fill="${SVG_OKLCH.inkSecondary}">${escapeSvgXml(subtitleKo)}</text>`);
  elements.push(`<text x="38" y="91" font-family="${FONT_MONO}" font-size="11" fill="${SVG_OKLCH.inkMuted}">SHA-256: ${escapeSvgXml(manifestHash.slice(0, 24))}…</text>`);

  // 헤더 상태 배지 2종 (야코비안 접힘 안전 배지 + 배경 대비 배지)
  const foldBadgeLabel = warped.audit.hasFoldOver
    ? `접힘 감지 ${String(warped.audit.foldOverCount)}건`
    : warped.wasSafelyClamped
      ? `접힘 0건 (자동 감쇠 ${fmtNum(warped.dampingFactor * 100, 0)}%)`
      : "야코비안 접힘 0건 · 안전";
  elements.push(
    buildStatusBadgeSvg(
      726,
      36,
      214,
      foldBadgeLabel,
      warped.audit.hasFoldOver ? "fail" : "pass",
    ),
  );
  const contrastBadgeLabel = outline.meetsDualRingReadability
    ? `이중 링 대비 ${fmtNum(outline.worstDualRingBackgroundContrast, 1)}:1 합격`
    : `대비 미달 ${fmtNum(outline.worstDualRingBackgroundContrast, 1)}:1`;
  elements.push(
    buildStatusBadgeSvg(
      952,
      36,
      212,
      contrastBadgeLabel,
      outline.meetsDualRingReadability ? "pass" : "fail",
    ),
  );

  // 메인 Coons 스테이지 프레임 및 배경 샘플 스트립(복잡 다색 배경 시뮬레이션)
  elements.push(
    `<rect x="${String(stageX)}" y="${String(stageY)}" width="${String(stageW)}" height="${String(stageH)}" rx="14" fill="${SVG_OKLCH.stageFrame}" stroke="${SVG_OKLCH.borderStrong}" stroke-width="1.2"/>`,
  );
  const sampleCount = Math.max(1, outline.sampleEvaluations.length);
  const stripW = (stageW - 8) / sampleCount;
  for (let i = 0; i < outline.sampleEvaluations.length; i += 1) {
    const evalItem = outline.sampleEvaluations[i];
    const sx = stageX + 4 + i * stripW;
    elements.push(
      `<rect x="${fmtNum(sx)}" y="${fmtNum(stageY + 4)}" width="${fmtNum(stripW + 0.5)}" height="${fmtNum(stageH - 8)}" fill="${evalItem.backgroundOklchCss}"/>`,
    );
  }

  // Coons 패치 UV 격자선 (내부 등곡선)
  const uvLinesU = 12;
  const uvLinesV = 6;
  for (let iu = 1; iu < uvLinesU; iu += 1) {
    const u = iu / uvLinesU;
    const pts: Vec2[] = [];
    for (let s = 0; s <= 12; s += 1) {
      pts.push(stageTf.mapPoint(evaluateCoonsPatchPoint(warped.envelope, u, s / 12)));
    }
    elements.push(
      `<path d="${pointsToSvgPath(pts, false)}" fill="none" stroke="${SVG_OKLCH.gridUvLine}" stroke-width="1" stroke-dasharray="4 3"/>`,
    );
  }
  for (let iv = 1; iv < uvLinesV; iv += 1) {
    const v = iv / uvLinesV;
    const pts: Vec2[] = [];
    for (let s = 0; s <= 20; s += 1) {
      pts.push(stageTf.mapPoint(evaluateCoonsPatchPoint(warped.envelope, s / 20, v)));
    }
    elements.push(
      `<path d="${pointsToSvgPath(pts, false)}" fill="none" stroke="${SVG_OKLCH.gridUvLine}" stroke-width="1" stroke-dasharray="4 3"/>`,
    );
  }

  // 접힘 발생 셀 강조 (존재 시)
  for (let i = 0; i < warped.audit.cells.length; i += 1) {
    const cell = warped.audit.cells[i];
    if (!cell.folded) continue;
    const mapped = stageTf.mapPoint(cell.center);
    elements.push(
      `<circle cx="${fmtNum(mapped.x)}" cy="${fmtNum(mapped.y)}" r="8" fill="${SVG_OKLCH.foldCellFill}"/>`,
    );
  }

  // Coons 패치 4변 경계 곡선 강조
  const sampleEdge = (edge: "top" | "bottom" | "left" | "right"): string => {
    const pts: Vec2[] = [];
    for (let s = 0; s <= 24; s += 1) {
      const t = s / 24;
      const p =
        edge === "top"
          ? evaluateCoonsPatchPoint(warped.envelope, t, 0)
          : edge === "bottom"
            ? evaluateCoonsPatchPoint(warped.envelope, t, 1)
            : edge === "left"
              ? evaluateCoonsPatchPoint(warped.envelope, 0, t)
              : evaluateCoonsPatchPoint(warped.envelope, 1, t);
      pts.push(stageTf.mapPoint(p));
    }
    return pointsToSvgPath(pts, false);
  };
  elements.push(`<path d="${sampleEdge("top")}" fill="none" stroke="${SVG_OKLCH.boundaryTop}" stroke-width="2.2"/>`);
  elements.push(`<path d="${sampleEdge("bottom")}" fill="none" stroke="${SVG_OKLCH.boundaryBottom}" stroke-width="2.2"/>`);
  elements.push(`<path d="${sampleEdge("left")}" fill="none" stroke="${SVG_OKLCH.boundarySide}" stroke-width="2.2"/>`);
  elements.push(`<path d="${sampleEdge("right")}" fill="none" stroke="${SVG_OKLCH.boundarySide}" stroke-width="2.2"/>`);

  // 워프된 SFX 글리프 다중 링 렌더링 (드롭 오프셋 -> 외부 보호 할로 -> 내부 색테 -> 본문 채움)
  const baseStrokeW = clampFinite(10 * stageTf.scale, 4, 16, 8);
  const innerAddW = clampFinite(outline.innerStrokePx * stageTf.scale * 1.4, 3, 18, 6);
  const outerAddW = clampFinite(outline.outerHaloPx * stageTf.scale * 1.5, 4, 22, 8);
  const dropShift = clampFinite(outline.dropOffsetPx * stageTf.scale, 2, 10, 4);

  const renderGlyphStrokePass = (
    strokeColor: string,
    strokeWidth: number,
    dx: number,
    dy: number,
  ): void => {
    for (let g = 0; g < warped.glyphs.length; g += 1) {
      const glyph = warped.glyphs[g];
      for (let s = 0; s < glyph.warpedStrokes.length; s += 1) {
        const mapped = glyph.warpedStrokes[s].map((pt) => {
          const m = stageTf.mapPoint(pt);
          return { x: m.x + dx, y: m.y + dy };
        });
        elements.push(
          `<path d="${pointsToSvgPath(mapped, false)}" fill="none" stroke="${strokeColor}" stroke-width="${fmtNum(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      }
    }
  };

  if (outline.outlineActivated) {
    renderGlyphStrokePass(
      SVG_OKLCH.dropShadow,
      baseStrokeW + innerAddW + outerAddW,
      dropShift,
      dropShift,
    );
    renderGlyphStrokePass(
      outline.outerHaloOklchCss,
      baseStrokeW + innerAddW + outerAddW,
      0,
      0,
    );
    renderGlyphStrokePass(
      outline.innerOutlineOklchCss,
      baseStrokeW + innerAddW,
      0,
      0,
    );
  }
  renderGlyphStrokePass(outline.fillOklchCss, baseStrokeW, 0, 0);

  // 글리프 경계 실루엣 + 회전 문자 라벨 오버레이
  for (let g = 0; g < warped.glyphs.length; g += 1) {
    const glyph = warped.glyphs[g];
    const mappedPoly = glyph.warpedBoundsPolygon.map(stageTf.mapPoint);
    elements.push(
      `<path d="${pointsToSvgPath(mappedPoly, true)}" fill="none" stroke="${SVG_OKLCH.gridUvLine}" stroke-width="0.9"/>`,
    );
  }

  // 하단 좌측 패널: 무아웃라인 vs 이중 링 배경 대비 비교 카드
  const leftX = 32;
  const bottomY = 472;
  const leftW = 700;
  const bottomH = 286;
  elements.push(
    `<rect x="${String(leftX)}" y="${String(bottomY)}" width="${String(leftW)}" height="${String(bottomH)}" rx="14" fill="${SVG_OKLCH.panelBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1.2"/>`,
  );
  elements.push(
    `<text x="${String(leftX + 18)}" y="${String(bottomY + 28)}" font-family="${FONT_SANS}" font-size="14" font-weight="700" fill="${SVG_OKLCH.inkPrimary}">배경 샘플별 무아웃라인 vs 이중 링 할로 가독성 비교 (목표 WCAG ≥ ${fmtNum(outline.targetContrastRatio, 1)}:1)</text>`,
  );
  elements.push(
    `<text x="${String(leftX + 18)}" y="${String(bottomY + 48)}" font-family="${FONT_SANS}" font-size="12" fill="${SVG_OKLCH.inkSecondary}">최악 배경 대비 개선: ${fmtNum(outline.worstNoOutlineContrast, 2)}:1 → ${fmtNum(outline.worstDualRingBackgroundContrast, 2)}:1 (×${fmtNum(outline.contrastImprovementMultiplier, 2)} 향상) · 본문–내부링 ${fmtNum(outline.fillToInnerContrast, 2)}:1</text>`,
  );

  const visibleSamples = outline.sampleEvaluations.slice(0, 4);
  const cardGap = 12;
  const cardW = (leftW - 36 - cardGap * Math.max(0, visibleSamples.length - 1)) / Math.max(1, visibleSamples.length);
  for (let i = 0; i < visibleSamples.length; i += 1) {
    const ev = visibleSamples[i];
    const cx = leftX + 18 + i * (cardW + cardGap);
    const cy = bottomY + 64;

    // 상단 스와치: 무아웃라인
    elements.push(`<rect x="${fmtNum(cx)}" y="${fmtNum(cy)}" width="${fmtNum(cardW)}" height="78" rx="8" fill="${ev.backgroundOklchCss}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1"/>`);
    elements.push(`<text x="${fmtNum(cx + cardW * 0.5)}" y="${fmtNum(cy + 47)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="22" font-weight="800" fill="${outline.fillOklchCss}">${escapeSvgXml(warped.text.slice(0, 4))}</text>`);
    elements.push(`<text x="${fmtNum(cx + 8)}" y="${fmtNum(cy + 94)}" font-family="${FONT_MONO}" font-size="11" fill="${SVG_OKLCH.inkSecondary}">무아웃라인 ${fmtNum(ev.noOutlineContrast, 2)}:1</text>`);

    // 하단 스와치: 이중 링 할로
    const cy2 = cy + 106;
    elements.push(`<rect x="${fmtNum(cx)}" y="${fmtNum(cy2)}" width="${fmtNum(cardW)}" height="78" rx="8" fill="${ev.backgroundOklchCss}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1"/>`);
    const sampleGlyph = escapeSvgXml(warped.text.slice(0, 4));
    elements.push(`<text x="${fmtNum(cx + cardW * 0.5)}" y="${fmtNum(cy2 + 47)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="22" font-weight="800" fill="none" stroke="${outline.outerHaloOklchCss}" stroke-width="9" stroke-linejoin="round">${sampleGlyph}</text>`);
    elements.push(`<text x="${fmtNum(cx + cardW * 0.5)}" y="${fmtNum(cy2 + 47)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="22" font-weight="800" fill="none" stroke="${outline.innerOutlineOklchCss}" stroke-width="4.5" stroke-linejoin="round">${sampleGlyph}</text>`);
    elements.push(`<text x="${fmtNum(cx + cardW * 0.5)}" y="${fmtNum(cy2 + 47)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="22" font-weight="800" fill="${outline.fillOklchCss}">${sampleGlyph}</text>`);
    elements.push(`<text x="${fmtNum(cx + 8)}" y="${fmtNum(cy2 + 94)}" font-family="${FONT_MONO}" font-size="11" font-weight="700" fill="${ev.meetsWcagAa ? SVG_OKLCH.passText : SVG_OKLCH.failText}">이중링 ${fmtNum(ev.dualRingBestContrast, 2)}:1 (ΔE ${fmtNum(ev.dualRingBestOklabDeltaE, 2)})</text>`);
  }

  // 하단 우측 패널: 야코비안·원근 면적·WGSL 계측 요약
  const rightX = 748;
  const rightW = 420;
  elements.push(
    `<rect x="${String(rightX)}" y="${String(bottomY)}" width="${String(rightW)}" height="${String(bottomH)}" rx="14" fill="${SVG_OKLCH.panelBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1.2"/>`,
  );
  elements.push(
    `<text x="${String(rightX + 18)}" y="${String(bottomY + 28)}" font-family="${FONT_SANS}" font-size="14" font-weight="700" fill="${SVG_OKLCH.inkPrimary}">Coons 패치 야코비안 · 글리프 면적 분포</text>`,
  );

  const metricRows: readonly [string, string][] = [
    ["최소 det(J) / 최대 det(J)", `${fmtNum(warped.audit.minJacobianDet, 0)} / ${fmtNum(warped.audit.maxJacobianDet, 0)}`],
    ["4모서리 · 경계 최대 오차", `${warped.audit.maxCornerError.toExponential(1)} / ${warped.audit.maxBoundaryError.toExponential(1)}`],
    ["앞→끝 글리프 면적 비율", `${fmtNum(warped.firstToLastAreaRatio * 100, 1)}% (${warped.isAreaMonotonicallyDecreasing ? "단조 축소" : "비단조"})`],
    ["아크 회전 폭 / 면적 보존", `${fmtNum(warped.arcAngleSpanDeg, 1)}° / ${fmtNum(warped.areaPreservationRatio * 100, 1)}%`],
    ["아웃라인 두께 (내/외/드롭)", `${fmtNum(outline.innerStrokePx, 1)} / ${fmtNum(outline.outerHaloPx, 1)} / ${fmtNum(outline.dropOffsetPx, 1)} px`],
    [
      "WebGPU WGSL 64B 검증",
      wgslValidation
        ? wgslValidation.valid
          ? `합격 (${String(wgslValidation.uniformBufferByteLength)}B · fwidth AA)`
          : `오류 ${String(wgslValidation.errors.length)}건`
        : "미실행",
    ],
  ];

  for (let i = 0; i < metricRows.length; i += 1) {
    const ry = bottomY + 56 + i * 24;
    elements.push(`<text x="${String(rightX + 18)}" y="${String(ry)}" font-family="${FONT_SANS}" font-size="12" fill="${SVG_OKLCH.inkSecondary}">${escapeSvgXml(metricRows[i][0])}</text>`);
    elements.push(`<text x="${String(rightX + rightW - 18)}" y="${String(ry)}" text-anchor="end" font-family="${FONT_MONO}" font-size="12" font-weight="600" fill="${SVG_OKLCH.inkPrimary}">${escapeSvgXml(metricRows[i][1])}</text>`);
  }

  // 글리프별 면적 막대 그래프
  const barAreaY = bottomY + 204;
  const maxGlyphArea = Math.max(
    1,
    ...warped.glyphs.map((g) => g.warpedArea),
  );
  const shownGlyphs = warped.glyphs.slice(0, 8);
  const barStep = (rightW - 36) / Math.max(1, shownGlyphs.length);
  for (let i = 0; i < shownGlyphs.length; i += 1) {
    const g = shownGlyphs[i];
    const ratio = clampFinite(g.warpedArea / maxGlyphArea, 0.05, 1, 0.5);
    const bx = rightX + 18 + i * barStep + 3;
    const bw = Math.max(8, barStep - 6);
    const bh = 42 * ratio;
    elements.push(`<rect x="${fmtNum(bx)}" y="${fmtNum(barAreaY)}" width="${fmtNum(bw)}" height="42" rx="4" fill="${SVG_OKLCH.barTrack}"/>`);
    elements.push(`<rect x="${fmtNum(bx)}" y="${fmtNum(barAreaY + (42 - bh))}" width="${fmtNum(bw)}" height="${fmtNum(bh)}" rx="4" fill="${SVG_OKLCH.barFill}"/>`);
    elements.push(`<text x="${fmtNum(bx + bw * 0.5)}" y="${fmtNum(barAreaY + 56)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="11" fill="${SVG_OKLCH.inkSecondary}">${escapeSvgXml(g.char)}</text>`);
  }

  if (input.artistNoteKo && input.artistNoteKo.trim().length > 0) {
    elements.push(
      `<text x="${String(rightX + 18)}" y="${String(bottomY + bottomH - 8)}" font-family="${FONT_SANS}" font-size="11" fill="${SVG_OKLCH.inkMuted}">감독 메모: ${escapeSvgXml(input.artistNoteKo.trim())}</text>`,
    );
  }

  elements.push("</svg>");
  return elements.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 웹툰 레터링 감독 QA 브리프를 생성한다.
 */
export function summarizeSfxEnvelopeAuditKo(
  input: SummarizeSfxEnvelopeAuditInput,
): SfxEnvelopeAuditBriefKo {
  const { warped, outline, wgslValidation } = input;
  const presetLabelKo = resolvePresetLabelKo(warped.presetId);
  const fp = computeSfxManifestFingerprint({
    text: warped.text,
    presetId: warped.presetId,
    envelope: warped.envelope,
    outline,
  });

  const boundaryPassed =
    warped.audit.maxCornerError < 1e-9 && warped.audit.maxBoundaryError < 1e-9;
  const foldPassed = !warped.audit.hasFoldOver && warped.audit.minJacobianDet > 0;
  const fillInnerPassed = outline.fillToInnerContrast >= outline.targetContrastRatio;
  const dualBgPassed = outline.worstDualRingBackgroundContrast >= outline.targetContrastRatio;
  const wgslPassed = wgslValidation.valid;

  const checks: readonly SfxAuditCheckItem[] = [
    {
      id: "coons-boundary",
      labelKo: "Coons 패치 4모서리·경계 정밀도",
      passed: boundaryPassed,
      measuredText: `최대 오차 ${Math.max(warped.audit.maxCornerError, warped.audit.maxBoundaryError).toExponential(2)}`,
      thresholdText: "< 1e-9",
      detailKo: boundaryPassed
        ? "4개 3차 베지어 경계와 모서리가 오차 없이 정확히 맞물렸습니다."
        : "경계 정점 정합 오차가 허용치를 넘었습니다. 모서리 정규화가 필요합니다.",
    },
    {
      id: "jacobian-foldover",
      labelKo: "야코비안 접힘·자기교차 검사",
      passed: foldPassed,
      measuredText: `접힘 ${String(warped.audit.foldOverCount)}건 · 최소 det(J) ${fmtNum(warped.audit.minJacobianDet, 1)}`,
      thresholdText: "접힘 0건 · det(J) > 0",
      detailKo: foldPassed
        ? warped.wasSafelyClamped
          ? `과도한 곡률 구부림을 안전 감쇠(${fmtNum(warped.dampingFactor * 100, 1)}%)로 보정해 전 격자 접힘 0건을 확보했습니다.`
          : "격자 전역에서 야코비안 행렬식이 양수를 유지해 글자 뒤집힘이 없습니다."
        : "일부 격자 셀에서 글리프가 뒤집히거나 겹칩니다. 안전 감쇠를 켜고 다시 배치하세요.",
    },
    {
      id: "fill-inner-contrast",
      labelKo: "본문–내부 아웃라인 대비",
      passed: fillInnerPassed,
      measuredText: `${fmtNum(outline.fillToInnerContrast, 2)}:1 (OKLab ΔE ${fmtNum(outline.fillToInnerOklabDeltaE, 2)})`,
      thresholdText: `>= ${fmtNum(outline.targetContrastRatio, 1)}:1`,
      detailKo: fillInnerPassed
        ? "글자 본문과 내부 색테 경계가 또렷하게 분리되어 획 윤곽이 뭉개지지 않습니다."
        : "본문 색과 내부 색테 대비가 부족합니다. 명도 차이를 더 벌려 주세요.",
    },
    {
      id: "dual-ring-bg-contrast",
      labelKo: "복합 배경 이중 링 분리 가독성",
      passed: dualBgPassed,
      measuredText: `최악 ${fmtNum(outline.worstDualRingBackgroundContrast, 2)}:1 (무아웃라인 대비 ×${fmtNum(outline.contrastImprovementMultiplier, 2)})`,
      thresholdText: `전 배경 >= ${fmtNum(outline.targetContrastRatio, 1)}:1`,
      detailKo: dualBgPassed
        ? `배경 표본 ${String(outline.sampleEvaluations.length)}곳 모두에서 이중 링이 효과음을 안정적으로 띄워 줍니다.`
        : "일부 배경 구간에서 효과음이 묻힙니다. 외부 보호 할로 명도를 재조정하세요.",
    },
    {
      id: "wgsl-shader",
      labelKo: "WebGPU 다중 링 SDF 셰이더 검증",
      passed: wgslPassed,
      measuredText: `${String(wgslValidation.uniformBufferByteLength)}B 유니폼 · 바인딩 ${String(wgslValidation.bindingCount)}개`,
      thresholdText: "64B 16B 정렬 · fwidth AA · 오류 0건",
      detailKo: wgslPassed
        ? "64바이트 유니폼 정렬과 fwidth 안티앨리어싱 규격을 모두 충족해 즉시 렌더 파이프라인에 올릴 수 있습니다."
        : `WGSL 검증 오류 ${String(wgslValidation.errors.length)}건을 먼저 정리해야 합니다.`,
    },
  ];

  const failedCount = checks.filter((c) => !c.passed).length;
  const grade: SfxAuditGrade =
    failedCount === 0
      ? warped.wasSafelyClamped
        ? "WARN"
        : "PASS"
      : "FAIL";
  const passed = failedCount === 0;
  const statusTag = grade === "PASS" ? "합격" : grade === "WARN" ? "조건부 합격" : "보류";

  const headlineKo = `[${statusTag}] "${warped.text}" ${presetLabelKo} 레터링 검수 — 접힘 ${String(warped.audit.foldOverCount)}건, 배경 대비 ${fmtNum(outline.worstDualRingBackgroundContrast, 1)}:1`;

  const datePrefix = input.generatedDateIso ? `[${input.generatedDateIso}] ` : "";
  const summaryParagraphKo = `${datePrefix}"${warped.text}"(${String(warped.glyphs.length)}자)를 ${presetLabelKo} Coons 패치에 배치하고 배경 표본 ${String(outline.sampleEvaluations.length)}곳의 명암을 점검했습니다. 무아웃라인 상태 최악 대비 ${fmtNum(outline.worstNoOutlineContrast, 2)}:1 구간을 이중 링 할로(내부 ${fmtNum(outline.innerStrokePx, 1)}px · 외부 ${fmtNum(outline.outerHaloPx, 1)}px)로 보강해 최소 ${fmtNum(outline.worstDualRingBackgroundContrast, 2)}:1(×${fmtNum(outline.contrastImprovementMultiplier, 2)} 개선)까지 끌어올렸습니다.`;

  const bulletLinesKo: string[] = [
    `워프 안전성: 최소 야코비안 det(J) ${fmtNum(warped.audit.minJacobianDet, 1)}, 접힘 ${String(warped.audit.foldOverCount)}건, 아크 회전 폭 ${fmtNum(warped.arcAngleSpanDeg, 1)}°`,
    `글리프 면적 흐름: 앞→끝 면적 비율 ${fmtNum(warped.firstToLastAreaRatio * 100, 1)}% (${warped.isAreaMonotonicallyDecreasing ? "원근 단조 축소 확인" : "비단조 연출 유지"}), 전체 면적 보존 ${fmtNum(warped.areaPreservationRatio * 100, 1)}%`,
    `이중 링 가독성: 본문–내부링 ${fmtNum(outline.fillToInnerContrast, 2)}:1, 내부–외부링 ${fmtNum(outline.innerToOuterContrast, 2)}:1, 전 배경 최악 ${fmtNum(outline.worstDualRingBackgroundContrast, 2)}:1`,
    `GPU 셰이더·지문: WGSL ${wgslPassed ? "정상" : "점검 필요"}(${String(wgslValidation.uniformBufferByteLength)}B), 매니페스트 SHA-256 ${fp.sfxManifestSha256Hex.slice(0, 16)}…`,
  ];
  if (input.artistNoteKo && input.artistNoteKo.trim().length > 0) {
    bulletLinesKo.push(`감독 메모: ${input.artistNoteKo.trim()}`);
  }

  return {
    grade,
    passed,
    sfxManifestSha256Hex: fp.sfxManifestSha256Hex,
    sfxText: warped.text,
    presetLabelKo,
    headlineKo,
    summaryParagraphKo,
    bulletLinesKo,
    checks,
  };
}
