/**
 * Wave 108 — 인쇄 대응 고대비 OKLCH 세로 스크롤 필름스트립 SVG 및 한국어 편집자 리듬 QA 요약기.
 */

import {
  BEAT_RHYTHM_PRESETS,
  MOBILE_VIEWPORT_SPECS,
  computeScaledViewportHeightPx,
  computeSetupCenteredViewportBounds,
  shouldIsolateRevealCut,
  type GutterGradientStyle,
  type MobileViewportProfile,
  type PanelRhythmBeatKind,
  type VerticalScrollPanelLayout,
} from "./vertical-scroll-gutter-rhythm-solver";
import type { VerticalScrollPacingAuditResult } from "./scroll-pacing-and-monotony-auditor";

export interface VerticalScrollRhythmSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly titleKo?: string;
  readonly highlightViewport?: MobileViewportProfile;
}

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.008 90)",
  stripBg: "oklch(0.996 0.003 90)",
  cardBg: "oklch(0.97 0.007 90)",
  borderStrong: "oklch(0.28 0.04 162)",
  borderSoft: "oklch(0.84 0.014 90)",
  textPrimary: "oklch(0.2 0.03 162)",
  textMuted: "oklch(0.46 0.025 162)",
  textInverse: "oklch(0.985 0.004 90)",
  gutterClean: "oklch(0.99 0.003 90)",
  gutterDarkTop: "oklch(0.93 0.01 90)",
  gutterDarkBottom: "oklch(0.22 0.02 250)",
  gutterTensionBlack: "oklch(0.18 0.015 255)",
  gutterMemoryTint: "oklch(0.94 0.028 75)",
  viewportFrameSafe: "oklch(0.44 0.12 155)",
  viewportFillSafe: "oklch(0.56 0.1 155 / 0.12)",
  viewportFrameLeak: "oklch(0.52 0.2 26)",
  viewportFillLeak: "oklch(0.58 0.19 26 / 0.15)",
  sparkLine: "oklch(0.38 0.12 246)",
  sparkArea: "oklch(0.56 0.11 246 / 0.14)",
  sparkThreshold: "oklch(0.54 0.18 32)",
  sparkPeak: "oklch(0.52 0.21 26)",
  monotonyMarker: "oklch(0.58 0.16 68)",
} as const;

const BEAT_FILL_OKLCH: Readonly<Record<PanelRhythmBeatKind, string>> = {
  "dialogue-volley": "oklch(0.93 0.032 238)",
  "action-rush": "oklch(0.91 0.06 38)",
  "suspense-hold": "oklch(0.88 0.03 272)",
  "twist-reveal": "oklch(0.87 0.075 18)",
  "quiet-aftermath": "oklch(0.93 0.038 158)",
  "cliffhanger-end": "oklch(0.86 0.07 340)",
};

const BEAT_STROKE_OKLCH: Readonly<Record<PanelRhythmBeatKind, string>> = {
  "dialogue-volley": "oklch(0.44 0.11 242)",
  "action-rush": "oklch(0.52 0.17 34)",
  "suspense-hold": "oklch(0.42 0.11 274)",
  "twist-reveal": "oklch(0.48 0.19 22)",
  "quiet-aftermath": "oklch(0.42 0.11 158)",
  "cliffhanger-end": "oklch(0.46 0.18 342)",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function gutterFillForStyle(style: GutterGradientStyle): string {
  if (style === "fade-to-dark") return "url(#wave108-gutter-fade-dark)";
  if (style === "tension-black") return OKLCH_PALETTE.gutterTensionBlack;
  if (style === "memory-soft-tint") return OKLCH_PALETTE.gutterMemoryTint;
  return OKLCH_PALETTE.gutterClean;
}

function pickTallestViewport(
  viewports: readonly MobileViewportProfile[],
  canvasWidthPx: number,
): MobileViewportProfile {
  let best: MobileViewportProfile = viewports[0] ?? "mobile-412x915";
  let bestHeight = 0;
  for (let i = 0; i < viewports.length; i += 1) {
    const profile = viewports[i];
    if (!profile) continue;
    const h = computeScaledViewportHeightPx(canvasWidthPx, profile);
    if (h >= bestHeight) {
      bestHeight = h;
      best = profile;
    }
  }
  return best;
}

/**
 * 세로 스크롤 웹툰의 컷 리듬, 여백 그라데이션, 반전 셋업 뷰포트 프레임 및 대사 밀도 스파크라인을
 * 인쇄 대응 고대비 OKLCH 미니어처 필름스트립 SVG로 렌더링한다.
 */
export function renderVerticalScrollRhythmSvg(
  layout: VerticalScrollPanelLayout,
  audit: VerticalScrollPacingAuditResult,
  options: VerticalScrollRhythmSvgOptions = {},
): string {
  const widthPx = Math.max(520, Math.round(options.widthPx ?? 760));
  const heightPx = Math.max(460, Math.round(options.heightPx ?? 720));
  const headerH = 84;
  const footerH = 42;
  const padX = 24;
  const plotTop = headerH + 14;
  const plotHeight = Math.max(220, heightPx - headerH - footerH - 28);
  const stripX = padX + 56;
  const stripW = 240;
  const sparkX = stripX + stripW + 58;
  const sparkW = Math.max(180, widthPx - sparkX - padX);

  const safeTotalHeight = Math.max(1, layout.totalHeightPx);
  const mapY = (episodeYPx: number): number => plotTop + (episodeYPx / safeTotalHeight) * plotHeight;
  const mapH = (spanPx: number): number => Math.max(1, (spanPx / safeTotalHeight) * plotHeight);

  const titleText = escapeXml(options.titleKo?.trim() || `${layout.episodeTitle} — 세로 스크롤 리듬 필름스트립`);
  const leakStatusBadge =
    audit.maxSpoilerLeakPx === 0
      ? "반전 스포일러 차단 0px"
      : `스포일러 노출 ${fmt(audit.maxSpoilerLeakPx)}px`;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(widthPx)} ${fmt(heightPx)}" width="${fmt(widthPx)}" height="${fmt(heightPx)}" role="img" aria-label="${titleText}">`,
  );
  lines.push("  <defs>");
  lines.push('    <linearGradient id="wave108-gutter-fade-dark" x1="0" y1="0" x2="0" y2="1">');
  lines.push(`      <stop offset="0%" stop-color="${OKLCH_PALETTE.gutterDarkTop}" />`);
  lines.push(`      <stop offset="100%" stop-color="${OKLCH_PALETTE.gutterDarkBottom}" />`);
  lines.push("    </linearGradient>");
  lines.push("  </defs>");

  lines.push(
    `  <rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(heightPx)}" rx="12" fill="${OKLCH_PALETTE.paperBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.5" />`,
  );
  lines.push(
    `  <text x="${fmt(padX)}" y="34" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${titleText}</text>`,
  );
  lines.push(
    `  <text x="${fmt(padX)}" y="56" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${OKLCH_PALETTE.textMuted}">${escapeXml(`총 ${layout.cuts.length}컷 · 세로 ${Math.round(layout.totalHeightPx)}px · 리듬 점수 ${audit.pacingHealthScore}/100 · 모델 추정 읽기 ${fmt(audit.estimatedReadDurationSec)}초`)}</text>`,
  );
  lines.push(
    `  <rect x="${fmt(widthPx - 198)}" y="22" width="174" height="28" rx="8" fill="${audit.maxSpoilerLeakPx === 0 ? OKLCH_PALETTE.viewportFillSafe : OKLCH_PALETTE.viewportFillLeak}" stroke="${audit.maxSpoilerLeakPx === 0 ? OKLCH_PALETTE.viewportFrameSafe : OKLCH_PALETTE.viewportFrameLeak}" stroke-width="1.2" />`,
  );
  lines.push(
    `  <text x="${fmt(widthPx - 111)}" y="40" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" fill="${audit.maxSpoilerLeakPx === 0 ? OKLCH_PALETTE.viewportFrameSafe : OKLCH_PALETTE.viewportFrameLeak}">${escapeXml(leakStatusBadge)}</text>`,
  );

  lines.push(
    `  <text x="${fmt(stripX)}" y="${fmt(plotTop - 6)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">세로 스크롤 필름스트립 (폭 ${fmt(layout.canvasWidthPx)}px)</text>`,
  );
  lines.push(
    `  <rect x="${fmt(stripX)}" y="${fmt(plotTop)}" width="${fmt(stripW)}" height="${fmt(plotHeight)}" rx="6" fill="${OKLCH_PALETTE.stripBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1.4" />`,
  );

  const ticks = 4;
  for (let t = 0; t <= ticks; t += 1) {
    const ratio = t / ticks;
    const epY = Math.round(layout.totalHeightPx * ratio);
    const svgY = plotTop + plotHeight * ratio;
    lines.push(
      `  <line x1="${fmt(stripX - 6)}" y1="${fmt(svgY)}" x2="${fmt(stripX)}" y2="${fmt(svgY)}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    );
    lines.push(
      `  <text x="${fmt(stripX - 10)}" y="${fmt(svgY + 3.5)}" text-anchor="end" font-family="ui-monospace, monospace" font-size="9.5" fill="${OKLCH_PALETTE.textMuted}">${epY}px</text>`,
    );
  }

  for (let i = 0; i < layout.cuts.length; i += 1) {
    const cut = layout.cuts[i];
    if (!cut) continue;

    if (cut.gutterBeforePx > 0) {
      const gutterStartY = cut.yPx - cut.gutterBeforePx;
      const gSvgY = mapY(gutterStartY);
      const gSvgH = mapH(cut.gutterBeforePx);
      lines.push(
        `  <rect x="${fmt(stripX + 2)}" y="${fmt(gSvgY)}" width="${fmt(stripW - 4)}" height="${fmt(gSvgH)}" fill="${gutterFillForStyle(cut.gutterGradientStyle)}" />`,
      );
      if (gSvgH >= 14) {
        const gutterTextFill =
          cut.gutterGradientStyle === "tension-black"
            ? OKLCH_PALETTE.textInverse
            : OKLCH_PALETTE.textMuted;
        lines.push(
          `  <text x="${fmt(stripX + stripW / 2)}" y="${fmt(gSvgY + gSvgH / 2 + 3.5)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="${gutterTextFill}">${escapeXml(`여백 ${Math.round(cut.gutterBeforePx)}px`)}</text>`,
        );
      }
    }

    const cSvgY = mapY(cut.yPx);
    const cSvgH = Math.max(4, mapH(cut.heightPx));
    const fill = BEAT_FILL_OKLCH[cut.beatKind];
    const stroke = BEAT_STROKE_OKLCH[cut.beatKind];
    lines.push(
      `  <rect x="${fmt(stripX + 8)}" y="${fmt(cSvgY)}" width="${fmt(stripW - 16)}" height="${fmt(cSvgH)}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />`,
    );
    if (cSvgH >= 15) {
      const beatLabel = BEAT_RHYTHM_PRESETS[cut.beatKind].labelKo;
      const cutLabel = `${cut.index + 1}. ${cut.cutId} (${beatLabel})`;
      lines.push(
        `  <text x="${fmt(stripX + 14)}" y="${fmt(cSvgY + Math.min(13, cSvgH - 3))}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeXml(cutLabel)}</text>`,
      );
    }
    if (cSvgH >= 28) {
      const metaLabel = `H:${Math.round(cut.heightPx)}px · 대사 ${cut.dialogueCharCount}자`;
      lines.push(
        `  <text x="${fmt(stripX + 14)}" y="${fmt(cSvgY + 25)}" font-family="ui-monospace, monospace" font-size="8.5" fill="${OKLCH_PALETTE.textMuted}">${escapeXml(metaLabel)}</text>`,
      );
    }
  }

  for (let r = 0; r < audit.monotonyRuns.length; r += 1) {
    const run = audit.monotonyRuns[r];
    if (!run) continue;
    const firstCut = layout.cuts[run.startCutIndex];
    const lastCut = layout.cuts[run.endCutIndex];
    if (!firstCut || !lastCut) continue;
    const y1 = mapY(firstCut.yPx);
    const y2 = mapY(lastCut.bottomYPx);
    lines.push(
      `  <line x1="${fmt(stripX + stripW + 6)}" y1="${fmt(y1)}" x2="${fmt(stripX + stripW + 6)}" y2="${fmt(y2)}" stroke="${OKLCH_PALETTE.monotonyMarker}" stroke-width="3" stroke-linecap="round" />`,
    );
  }

  const targetRevealCut = layout.cuts.find((cut) => cut.index > 0 && shouldIsolateRevealCut(cut));
  if (targetRevealCut) {
    const setupCut = layout.cuts[targetRevealCut.index - 1];
    if (setupCut) {
      const overlayProfile =
        options.highlightViewport ?? pickTallestViewport(audit.auditedViewports, layout.canvasWidthPx);
      const viewportHeightPx = computeScaledViewportHeightPx(layout.canvasWidthPx, overlayProfile);
      const bounds = computeSetupCenteredViewportBounds(setupCut.yPx, setupCut.heightPx, viewportHeightPx);
      const clampedBottom = Math.min(layout.totalHeightPx, bounds.viewportBottomYPx);
      const vTopSvg = mapY(bounds.viewportTopYPx);
      const vBottomSvg = mapY(clampedBottom);
      const vHeightSvg = Math.max(4, vBottomSvg - vTopSvg);
      const leakOnOverlay = Math.max(0, bounds.viewportBottomYPx - targetRevealCut.yPx);
      const frameColor =
        leakOnOverlay <= 0 ? OKLCH_PALETTE.viewportFrameSafe : OKLCH_PALETTE.viewportFrameLeak;
      const frameFill =
        leakOnOverlay <= 0 ? OKLCH_PALETTE.viewportFillSafe : OKLCH_PALETTE.viewportFillLeak;
      const overlaySpec = MOBILE_VIEWPORT_SPECS[overlayProfile];

      lines.push(
        `  <rect x="${fmt(stripX - 6)}" y="${fmt(vTopSvg)}" width="${fmt(stripW + 12)}" height="${fmt(vHeightSvg)}" rx="5" fill="${frameFill}" stroke="${frameColor}" stroke-width="1.8" stroke-dasharray="5 3" />`,
      );
      lines.push(
        `  <text x="${fmt(stripX + stripW + 12)}" y="${fmt(Math.min(plotTop + plotHeight - 4, vBottomSvg + 3))}" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="700" fill="${frameColor}">${escapeXml(`${overlaySpec.cssWidthPx}×${overlaySpec.cssHeightPx}`)}</text>`,
      );
    }
  }

  lines.push(
    `  <text x="${fmt(sparkX)}" y="${fmt(plotTop - 6)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeXml(`대사 밀도 스파크라인 (상한 ${audit.maxCharsPerViewport}자/화면)`)}</text>`,
  );
  lines.push(
    `  <rect x="${fmt(sparkX)}" y="${fmt(plotTop)}" width="${fmt(sparkW)}" height="${fmt(plotHeight)}" rx="6" fill="${OKLCH_PALETTE.cardBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1.2" />`,
  );

  const maxAxisChars = Math.max(
    audit.maxCharsPerViewport * 1.4,
    audit.peakDialogueCharsPerViewport * 1.15,
    140,
  );
  const mapSparkX = (chars: number): number =>
    sparkX + 10 + (Math.min(chars, maxAxisChars) / maxAxisChars) * Math.max(20, sparkW - 22);
  const thresholdX = mapSparkX(audit.maxCharsPerViewport);

  lines.push(
    `  <line x1="${fmt(thresholdX)}" y1="${fmt(plotTop)}" x2="${fmt(thresholdX)}" y2="${fmt(plotTop + plotHeight)}" stroke="${OKLCH_PALETTE.sparkThreshold}" stroke-width="1.2" stroke-dasharray="4 3" />`,
  );
  lines.push(
    `  <text x="${fmt(thresholdX + 4)}" y="${fmt(plotTop + 14)}" font-family="ui-monospace, monospace" font-size="9" fill="${OKLCH_PALETTE.sparkThreshold}">${audit.maxCharsPerViewport}자</text>`,
  );

  if (audit.dialogueDensitySamples.length > 0) {
    const polylinePoints: string[] = [];
    const areaPoints: string[] = [];
    const firstSample = audit.dialogueDensitySamples[0];
    const lastSample = audit.dialogueDensitySamples[audit.dialogueDensitySamples.length - 1];
    if (firstSample) {
      areaPoints.push(`${fmt(sparkX + 10)},${fmt(mapY(firstSample.viewportCenterYPx))}`);
    }
    for (let s = 0; s < audit.dialogueDensitySamples.length; s += 1) {
      const sample = audit.dialogueDensitySamples[s];
      if (!sample) continue;
      const sx = mapSparkX(sample.visibleDialogueChars);
      const sy = mapY(sample.viewportCenterYPx);
      polylinePoints.push(`${fmt(sx)},${fmt(sy)}`);
      areaPoints.push(`${fmt(sx)},${fmt(sy)}`);
    }
    if (lastSample) {
      areaPoints.push(`${fmt(sparkX + 10)},${fmt(mapY(lastSample.viewportCenterYPx))}`);
    }
    lines.push(
      `  <polygon points="${areaPoints.join(" ")}" fill="${OKLCH_PALETTE.sparkArea}" />`,
    );
    lines.push(
      `  <polyline points="${polylinePoints.join(" ")}" fill="none" stroke="${OKLCH_PALETTE.sparkLine}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`,
    );

    for (let w = 0; w < audit.dialogueTextWalls.length; w += 1) {
      const wall = audit.dialogueTextWalls[w];
      if (!wall) continue;
      const centerY = Math.min(
        layout.totalHeightPx,
        (wall.peakViewportTopYPx + wall.peakViewportBottomYPx) / 2,
      );
      const px = mapSparkX(wall.visibleDialogueChars);
      const py = mapY(centerY);
      lines.push(
        `  <circle cx="${fmt(px)}" cy="${fmt(py)}" r="4" fill="${OKLCH_PALETTE.sparkPeak}" />`,
      );
    }
  } else {
    lines.push(
      `  <text x="${fmt(sparkX + sparkW / 2)}" y="${fmt(plotTop + plotHeight / 2)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${OKLCH_PALETTE.textMuted}">대사 샘플 없음</text>`,
    );
  }

  const footerText = escapeXml(
    `감사 뷰포트: ${audit.auditedViewports.map((v) => `${MOBILE_VIEWPORT_SPECS[v].cssWidthPx}×${MOBILE_VIEWPORT_SPECS[v].cssHeightPx}`).join(", ")} · 대사 피크 ${audit.peakDialogueCharsPerViewport}자 · 단조 구간 ${audit.monotonyRuns.length}건`,
  );
  lines.push(
    `  <text x="${fmt(padX)}" y="${fmt(heightPx - 16)}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${footerText}</text>`,
  );
  lines.push("</svg>");

  return lines.join("\n");
}

/**
 * 세로 스크롤 웹툰 리듬 감사 결과를 편집자용 한국어 QA 브리프로 요약한다.
 */
export function summarizeVerticalPacingAuditKo(
  layout: VerticalScrollPanelLayout,
  audit: VerticalScrollPacingAuditResult,
): string {
  const viewportSummary = audit.auditedViewports
    .map((profile) => {
      const spec = MOBILE_VIEWPORT_SPECS[profile];
      return `${spec.cssWidthPx}×${spec.cssHeightPx}`;
    })
    .join(" / ");

  const lines: string[] = [];
  lines.push(`[세로 스크롤 리듬 QA] ${layout.episodeTitle} (${layout.episodeId})`);
  lines.push(
    `- 기본 제원: 캔버스 폭 ${Math.round(layout.canvasWidthPx)}px, 총 ${layout.cuts.length}컷, 전체 세로 길이 ${Math.round(layout.totalHeightPx)}px`,
  );
  lines.push(`- 종합 리듬 점수: ${audit.pacingHealthScore}/100 (감사 기준: ${viewportSummary})`);

  if (audit.spoilerLeaks.length === 0) {
    lines.push("- 반전 스포일러 감사: 노출 0px (직전 셋업 컷 중앙 정렬 시 반전·엔딩 컷 완전 격리)");
  } else {
    lines.push(
      `- 반전 스포일러 감사: ${audit.spoilerLeaks.length}건 조기 노출 감지 (최대 ${fmt(audit.maxSpoilerLeakPx)}px)`,
    );
  }

  if (audit.dialogueTextWalls.length === 0) {
    lines.push(
      `- 대사 밀도 감사: 통과 (화면당 최대 ${audit.peakDialogueCharsPerViewport}자 / 권장 상한 ${audit.maxCharsPerViewport}자)`,
    );
  } else {
    lines.push(
      `- 대사 밀도 감사: 대사 과밀 ${audit.dialogueTextWalls.length}건 감지 (화면당 최대 ${audit.peakDialogueCharsPerViewport}자 / 상한 ${audit.maxCharsPerViewport}자)`,
    );
  }

  if (audit.monotonyRuns.length === 0) {
    lines.push("- 단조 반복 감사: 0건 (컷 높이·여백 완급 유지)");
  } else {
    const runRanges = audit.monotonyRuns
      .map((run) => `${run.cutIds[0] ?? run.startCutIndex}–${run.cutIds[run.cutIds.length - 1] ?? run.endCutIndex}(${run.runLength}컷)`)
      .join(", ");
    lines.push(`- 단조 반복 감사: ${audit.monotonyRuns.length}개 구간 감지 (${runRanges})`);
  }

  lines.push(
    `- 예상 읽기 시간(모델 추정치, 실측 독자 텔레메트리 아님): 약 ${fmt(audit.estimatedReadDurationSec)}초`,
  );
  lines.push("- 편집자 조정 권고:");
  for (let i = 0; i < audit.rebalanceHintsKo.length; i += 1) {
    const hint = audit.rebalanceHintsKo[i];
    if (hint) {
      lines.push(`  · ${hint}`);
    }
  }

  return lines.join("\n");
}
