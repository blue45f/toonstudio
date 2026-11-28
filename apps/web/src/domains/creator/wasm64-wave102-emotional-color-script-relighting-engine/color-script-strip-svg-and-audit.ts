/**
 * Wave 102 — OKLCH 전용 고대비 색채 스크립트 필름스트립 SVG 렌더러 및 한국어 아트디렉터 감사 요약.
 *
 * - SVG 내부의 모든 색상 표현에 CSS Color 4 `oklch(...)`만 사용해 raw hex/rgb 문자열을 원천 배제한다.
 * - 장면별 4단 스와치 바(`rim / lit / midtone / shadow`), 감정 명도 곡선 오버레이, 절정(`climax`) 마커,
 *   피부색 보호 배지, WCAG 대비율 배지를 한눈에 확인할 수 있게 배치한다.
 * - 모든 좌표에 유한수 가드를 적용(`0` NaN/Infinity)하고 모든 사용자 텍스트를 XML 이스케이프한다.
 */

import { formatOklchCss } from "./oklch-chromatic-adaptation-relighter";
import type {
  CompiledColorScriptScene,
  EmotionArcPhase,
  EpisodeColorScriptArc,
} from "./episode-color-script-arc-compiler";

export interface EpisodeColorScriptSvgOptions {
  readonly cardWidthPx?: number;
  readonly cardGapPx?: number;
  readonly titleOverrideKo?: string;
}

export interface ColorScriptAuditSummaryOptions {
  readonly generatedDateIso?: string;
}

// 인쇄·고대비 대응 Calm Atelier OKLCH 토큰 팔레트 (raw hex/rgb 금지)
const SVG_OKLCH_TOKENS = {
  canvasBg: "oklch(0.980 0.008 90)",
  cardBg: "oklch(1.000 0.000 0)",
  headerBg: "oklch(0.955 0.011 88)",
  chartBg: "oklch(0.968 0.008 92)",
  borderSoft: "oklch(0.320 0.040 158 / 0.22)",
  borderStrong: "oklch(0.300 0.050 158 / 0.42)",
  inkPrimary: "oklch(0.240 0.045 158)",
  inkSecondary: "oklch(0.410 0.028 160)",
  inkMuted: "oklch(0.500 0.020 160)",
  passFill: "oklch(0.935 0.045 152)",
  passStroke: "oklch(0.430 0.115 152)",
  passText: "oklch(0.260 0.078 152)",
  climaxFill: "oklch(0.935 0.068 58)",
  climaxStroke: "oklch(0.540 0.165 42)",
  climaxText: "oklch(0.320 0.112 38)",
  failFill: "oklch(0.930 0.058 24)",
  failStroke: "oklch(0.520 0.185 26)",
  failText: "oklch(0.310 0.125 26)",
  curveLine: "oklch(0.330 0.085 248)",
  curveSpanFill: "oklch(0.620 0.060 242 / 0.18)",
  gridLine: "oklch(0.380 0.025 160 / 0.18)",
  whiteStroke: "oklch(0.990 0.002 90)",
} as const;

const EMOTION_ARC_LABEL_KO: Readonly<Record<EmotionArcPhase, string>> = {
  calm: "안정",
  "rising-tension": "긴장 고조",
  climax: "절정",
  flashback: "회상",
  relief: "여운·해소",
};

/** XML 특수문자(`&`, `<`, `>`, `"`, `'`)를 이스케이프한다. */
export function escapeColorScriptXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeSvgNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.max(min, Math.min(max, value));
  return Math.round(clamped * 100) / 100;
}

function fmtNum(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  return String(safe);
}

function truncateText(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) {
    return raw;
  }
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function buildSceneCardLines(
  scene: CompiledColorScriptScene,
  x: number,
  y: number,
  cardW: number,
  cardH: number,
): readonly string[] {
  const out: string[] = [];
  const isClimax = scene.emotionArc === "climax";
  const strokeColor = isClimax ? SVG_OKLCH_TOKENS.climaxStroke : SVG_OKLCH_TOKENS.borderSoft;
  const strokeWidth = isClimax ? "2" : "1";

  out.push(
    `  <rect x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(cardW)}" height="${fmtNum(cardH)}" rx="10" fill="${SVG_OKLCH_TOKENS.cardBg}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />`,
  );

  // 장면 번호 + 감정 아크 배지
  const arcLabel = EMOTION_ARC_LABEL_KO[scene.emotionArc];
  const headerBadgeFill = isClimax ? SVG_OKLCH_TOKENS.climaxFill : SVG_OKLCH_TOKENS.headerBg;
  const headerBadgeText = isClimax ? SVG_OKLCH_TOKENS.climaxText : SVG_OKLCH_TOKENS.inkPrimary;
  out.push(
    `  <rect x="${fmtNum(x + 10)}" y="${fmtNum(y + 10)}" width="${fmtNum(cardW - 20)}" height="24" rx="6" fill="${headerBadgeFill}" />`,
  );
  const badgeTitle = isClimax
    ? `★ #${String(scene.sceneIndex + 1)} ${arcLabel} (CLIMAX)`
    : `#${String(scene.sceneIndex + 1)} ${arcLabel}`;
  out.push(
    `  <text x="${fmtNum(x + 18)}" y="${fmtNum(y + 26)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" font-weight="700" fill="${headerBadgeText}">${escapeColorScriptXml(badgeTitle)}</text>`,
  );

  // 장면 제목 및 조명 분위기
  out.push(
    `  <text x="${fmtNum(x + 12)}" y="${fmtNum(y + 52)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="12" font-weight="700" fill="${SVG_OKLCH_TOKENS.inkPrimary}">${escapeColorScriptXml(truncateText(scene.titleKo, 16))}</text>`,
  );
  out.push(
    `  <text x="${fmtNum(x + 12)}" y="${fmtNum(y + 68)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="10.5" fill="${SVG_OKLCH_TOKENS.inkSecondary}">${escapeColorScriptXml(scene.presetLabelKo)} · ${String(scene.relitPalette.preset.kelvin)}K</text>`,
  );

  // 4단 스와치 바 (Rim / Lit / Midtone / Shadow) + 좌측 부드러운 그라데이션 미리보기
  const barTop = y + 78;
  const barHeight = 96;
  const gradW = 22;
  const swatchX = x + 12 + gradW + 6;
  const swatchW = cardW - 24 - gradW - 6;
  const bandH = barHeight / 4;
  const gradId = `scene-grad-${String(scene.sceneIndex)}`;

  out.push(
    `  <rect x="${fmtNum(x + 12)}" y="${fmtNum(barTop)}" width="${fmtNum(gradW)}" height="${fmtNum(barHeight)}" rx="4" fill="url(#${gradId})" stroke="${SVG_OKLCH_TOKENS.borderSoft}" stroke-width="1" />`,
  );

  const bands: ReadonlyArray<{ readonly label: string; readonly color: string; readonly lVal: number }> = [
    { label: "RIM", color: formatOklchCss(scene.bandRimOklch), lVal: scene.bandRimOklch.l },
    { label: "LIT", color: formatOklchCss(scene.bandLitOklch), lVal: scene.bandLitOklch.l },
    { label: "MID", color: formatOklchCss(scene.bandMidtoneOklch), lVal: scene.bandMidtoneOklch.l },
    { label: "SHD", color: formatOklchCss(scene.bandShadowOklch), lVal: scene.bandShadowOklch.l },
  ];

  for (let bi = 0; bi < bands.length; bi += 1) {
    const band = bands[bi];
    const by = barTop + bi * bandH;
    const textFill = band.lVal >= 0.62 ? SVG_OKLCH_TOKENS.inkPrimary : SVG_OKLCH_TOKENS.whiteStroke;
    out.push(
      `  <rect x="${fmtNum(swatchX)}" y="${fmtNum(by)}" width="${fmtNum(swatchW)}" height="${fmtNum(bandH)}" fill="${band.color}" stroke="${SVG_OKLCH_TOKENS.borderSoft}" stroke-width="0.6" />`,
    );
    out.push(
      `  <text x="${fmtNum(swatchX + 6)}" y="${fmtNum(by + 15)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="9.5" font-weight="700" fill="${textFill}">${band.label} L${band.lVal.toFixed(2)}</text>`,
    );
  }

  // 피부 보호 배지
  const skinY = barTop + barHeight + 12;
  const skinOk = scene.relitPalette.allSkinProtected;
  const skinFill = skinOk ? SVG_OKLCH_TOKENS.passFill : SVG_OKLCH_TOKENS.failFill;
  const skinStroke = skinOk ? SVG_OKLCH_TOKENS.passStroke : SVG_OKLCH_TOKENS.failStroke;
  const skinText = skinOk ? SVG_OKLCH_TOKENS.passText : SVG_OKLCH_TOKENS.failText;
  const skinLabel = skinOk
    ? `피부 보호 OK · ΔH ${scene.relitPalette.maxSkinHueDriftDeg.toFixed(1)}°`
    : `피부 이탈 주의 · ΔH ${scene.relitPalette.maxSkinHueDriftDeg.toFixed(1)}°`;
  out.push(
    `  <rect x="${fmtNum(x + 12)}" y="${fmtNum(skinY)}" width="${fmtNum(cardW - 24)}" height="22" rx="5" fill="${skinFill}" stroke="${skinStroke}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtNum(x + 18)}" y="${fmtNum(skinY + 14.5)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="10" font-weight="700" fill="${skinText}">${escapeColorScriptXml(skinLabel)}</text>`,
  );

  // WCAG 말풍선 가독성 + 암부 채도 유지 배지
  const wcagY = skinY + 28;
  const wcagOk = scene.balloonContrast.passed;
  const wcagFill = wcagOk ? SVG_OKLCH_TOKENS.passFill : SVG_OKLCH_TOKENS.failFill;
  const wcagStroke = wcagOk ? SVG_OKLCH_TOKENS.passStroke : SVG_OKLCH_TOKENS.failStroke;
  const wcagText = wcagOk ? SVG_OKLCH_TOKENS.passText : SVG_OKLCH_TOKENS.failText;
  const wcagLabel = wcagOk
    ? `WCAG ${scene.balloonContrast.contrastRatio.toFixed(1)}:1 · 암부 ${Math.round(scene.relitPalette.minShadowChromaRetention * 100)}%`
    : `WCAG 미달 ${scene.balloonContrast.contrastRatio.toFixed(1)}:1`;
  out.push(
    `  <rect x="${fmtNum(x + 12)}" y="${fmtNum(wcagY)}" width="${fmtNum(cardW - 24)}" height="22" rx="5" fill="${wcagFill}" stroke="${wcagStroke}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtNum(x + 18)}" y="${fmtNum(wcagY + 14.5)}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="9.5" font-weight="700" fill="${wcagText}">${escapeColorScriptXml(wcagLabel)}</text>`,
  );

  return out;
}

/**
 * 컴파일된 에피소드 감정 색채 스크립트를 인쇄 대응 고대비 OKLCH 필름스트립 SVG로 렌더링한다.
 */
export function renderEpisodeColorScriptSvg(
  colorScript: EpisodeColorScriptArc,
  options?: EpisodeColorScriptSvgOptions,
): string {
  const cardW = safeSvgNumber(options?.cardWidthPx ?? 186, 186, 148, 280);
  const cardGap = safeSvgNumber(options?.cardGapPx ?? 24, 24, 14, 48);
  const padX = 24;
  const padY = 22;
  const headerH = 66;
  const cardH = 246;
  const curveBoxH = 112;
  const sectionGap = 22;

  const sceneCount = colorScript.scenes.length;
  const contentW =
    sceneCount === 0
      ? 520
      : Math.max(520, sceneCount * cardW + Math.max(0, sceneCount - 1) * cardGap);
  const totalW = padX * 2 + contentW;
  const totalH = padY * 2 + headerH + sectionGap + cardH + sectionGap + curveBoxH;
  const titleText = options?.titleOverrideKo ?? `${colorScript.episodeTitleKo} (${colorScript.episodeId})`;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtNum(totalW)}" height="${fmtNum(totalH)}" viewBox="0 0 ${fmtNum(totalW)} ${fmtNum(totalH)}" role="img" aria-label="${escapeColorScriptXml(`감정 색채 스크립트 필름스트립: ${titleText}`)}">`,
  );
  lines.push(`  <title>${escapeColorScriptXml(titleText)}</title>`);

  // 장면별 4단 그라데이션 정의 (OKLCH 전용)
  lines.push("  <defs>");
  for (let i = 0; i < sceneCount; i += 1) {
    const sc = colorScript.scenes[i];
    lines.push(`    <linearGradient id="scene-grad-${String(i)}" x1="0" y1="0" x2="0" y2="1">`);
    lines.push(`      <stop offset="0%" stop-color="${formatOklchCss(sc.bandRimOklch)}" />`);
    lines.push(`      <stop offset="33%" stop-color="${formatOklchCss(sc.bandLitOklch)}" />`);
    lines.push(`      <stop offset="68%" stop-color="${formatOklchCss(sc.bandMidtoneOklch)}" />`);
    lines.push(`      <stop offset="100%" stop-color="${formatOklchCss(sc.bandShadowOklch)}" />`);
    lines.push("    </linearGradient>");
  }
  lines.push("  </defs>");

  // 배경 캔버스 + 상단 헤더 바
  lines.push(
    `  <rect x="0" y="0" width="${fmtNum(totalW)}" height="${fmtNum(totalH)}" fill="${SVG_OKLCH_TOKENS.canvasBg}" />`,
  );
  lines.push(
    `  <rect x="${fmtNum(padX)}" y="${fmtNum(padY)}" width="${fmtNum(contentW)}" height="${fmtNum(headerH)}" rx="10" fill="${SVG_OKLCH_TOKENS.headerBg}" stroke="${SVG_OKLCH_TOKENS.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmtNum(padX + 16)}" y="${fmtNum(padY + 28)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="15" font-weight="700" fill="${SVG_OKLCH_TOKENS.inkPrimary}">${escapeColorScriptXml(titleText)}</text>`,
  );

  const statusText = colorScript.overallPassed
    ? `종합 판정: 적합 · 장면 ${String(sceneCount)}개 · 최대 피부 ΔH ${colorScript.maxSkinHueDriftDeg.toFixed(1)}° · 최소 WCAG ${colorScript.minObservedBalloonWcagRatio.toFixed(1)}:1`
    : `종합 판정: 보정 필요 · 장면 ${String(sceneCount)}개 · WCAG 미달 ${String(colorScript.failingWcagSceneIds.length)}건`;
  lines.push(
    `  <text x="${fmtNum(padX + 16)}" y="${fmtNum(padY + 50)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11.5" fill="${SVG_OKLCH_TOKENS.inkSecondary}">${escapeColorScriptXml(statusText)}</text>`,
  );

  // 장면 필름스트립 카드 배치 + 인접 ΔE 전환 배지
  const cardsTop = padY + headerH + sectionGap;
  const centerXs: number[] = [];

  if (sceneCount === 0) {
    lines.push(
      `  <rect x="${fmtNum(padX)}" y="${fmtNum(cardsTop)}" width="${fmtNum(contentW)}" height="${fmtNum(cardH)}" rx="10" fill="${SVG_OKLCH_TOKENS.cardBg}" stroke="${SVG_OKLCH_TOKENS.borderSoft}" stroke-width="1" />`,
    );
    lines.push(
      `  <text x="${fmtNum(padX + contentW * 0.5)}" y="${fmtNum(cardsTop + cardH * 0.5)}" text-anchor="middle" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="13" fill="${SVG_OKLCH_TOKENS.inkMuted}">등록된 장면이 없습니다.</text>`,
    );
  } else {
    for (let i = 0; i < sceneCount; i += 1) {
      const sc = colorScript.scenes[i];
      const cx = padX + i * (cardW + cardGap);
      centerXs.push(cx + cardW * 0.5);
      const cardLines = buildSceneCardLines(sc, cx, cardsTop, cardW, cardH);
      for (let li = 0; li < cardLines.length; li += 1) {
        lines.push(cardLines[li]);
      }

      if (i > 0 && sc.deltaEFromPreviousScene !== null) {
        const gapMidX = cx - cardGap * 0.5;
        const badgeY = cardsTop + 124;
        lines.push(
          `  <rect x="${fmtNum(gapMidX - 18)}" y="${fmtNum(badgeY - 10)}" width="36" height="20" rx="10" fill="${SVG_OKLCH_TOKENS.cardBg}" stroke="${SVG_OKLCH_TOKENS.borderStrong}" stroke-width="1" />`,
        );
        lines.push(
          `  <text x="${fmtNum(gapMidX)}" y="${fmtNum(badgeY + 3.5)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="8.5" font-weight="700" fill="${SVG_OKLCH_TOKENS.inkPrimary}">Δ${sc.deltaEFromPreviousScene.toFixed(2)}</text>`,
        );
      }
    }
  }

  // 하단 감정 명도 곡선 오버레이 (Highlight-Shadow 포락선 + 우세 명도 곡선 + 절정 마커)
  const chartTop = cardsTop + cardH + sectionGap;
  lines.push(
    `  <rect x="${fmtNum(padX)}" y="${fmtNum(chartTop)}" width="${fmtNum(contentW)}" height="${fmtNum(curveBoxH)}" rx="10" fill="${SVG_OKLCH_TOKENS.chartBg}" stroke="${SVG_OKLCH_TOKENS.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="${fmtNum(padX + 14)}" y="${fmtNum(chartTop + 20)}" font-family="Pretendard, Apple SD Gothic Neo, sans-serif" font-size="11" font-weight="700" fill="${SVG_OKLCH_TOKENS.inkPrimary}">감정 명도 곡선 (OKLCH L · 음영~하이라이트 명암 폭)</text>`,
  );

  const plotTop = chartTop + 30;
  const plotH = curveBoxH - 46;
  const mapLToY = (lVal: number): number =>
    safeSvgNumber(plotTop + (1 - Math.max(0, Math.min(1, lVal))) * plotH, plotTop + plotH * 0.5, plotTop, plotTop + plotH);

  // 기준 그리드선 (L = 0.25, 0.50, 0.75)
  const guideLevels: readonly number[] = [0.25, 0.5, 0.75];
  for (let gi = 0; gi < guideLevels.length; gi += 1) {
    const gy = mapLToY(guideLevels[gi]);
    lines.push(
      `  <line x1="${fmtNum(padX + 12)}" y1="${fmtNum(gy)}" x2="${fmtNum(padX + contentW - 12)}" y2="${fmtNum(gy)}" stroke="${SVG_OKLCH_TOKENS.gridLine}" stroke-dasharray="4 3" stroke-width="1" />`,
    );
  }

  if (sceneCount > 0) {
    const upperPts: string[] = [];
    const lowerPts: string[] = [];
    const midPts: string[] = [];

    for (let i = 0; i < sceneCount; i += 1) {
      const sc = colorScript.scenes[i];
      const px = centerXs[i];
      upperPts.push(`${fmtNum(px)},${fmtNum(mapLToY(sc.highlightLuminance))}`);
      lowerPts.unshift(`${fmtNum(px)},${fmtNum(mapLToY(sc.shadowLuminance))}`);
      midPts.push(`${fmtNum(px)},${fmtNum(mapLToY(sc.dominantOklch.l))}`);
    }

    if (sceneCount >= 2) {
      lines.push(
        `  <polygon points="${upperPts.concat(lowerPts).join(" ")}" fill="${SVG_OKLCH_TOKENS.curveSpanFill}" />`,
      );
      lines.push(
        `  <polyline points="${midPts.join(" ")}" fill="none" stroke="${SVG_OKLCH_TOKENS.curveLine}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />`,
      );
    }

    for (let i = 0; i < sceneCount; i += 1) {
      const sc = colorScript.scenes[i];
      const px = centerXs[i];
      const py = mapLToY(sc.dominantOklch.l);
      if (sc.emotionArc === "climax") {
        // 절정 마름모 마커
        const r = 7;
        const diamond = `${fmtNum(px)},${fmtNum(py - r)} ${fmtNum(px + r)},${fmtNum(py)} ${fmtNum(px)},${fmtNum(py + r)} ${fmtNum(px - r)},${fmtNum(py)}`;
        lines.push(
          `  <polygon points="${diamond}" fill="${SVG_OKLCH_TOKENS.climaxStroke}" stroke="${SVG_OKLCH_TOKENS.whiteStroke}" stroke-width="1.6" />`,
        );
      } else {
        lines.push(
          `  <circle cx="${fmtNum(px)}" cy="${fmtNum(py)}" r="4.5" fill="${formatOklchCss(sc.dominantOklch)}" stroke="${SVG_OKLCH_TOKENS.curveLine}" stroke-width="1.6" />`,
        );
      }
      lines.push(
        `  <text x="${fmtNum(px)}" y="${fmtNum(chartTop + curveBoxH - 6)}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="9.5" fill="${SVG_OKLCH_TOKENS.inkSecondary}">S${String(i + 1)} span ${sc.luminanceSpan.toFixed(2)}</text>`,
      );
    }
  }

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 에피소드 감정 색채 스크립트 감사 결과를 자연스러운 한국어 아트디렉터 검토 보고서로 요약한다.
 */
export function summarizeColorScriptAuditKo(
  colorScript: EpisodeColorScriptArc,
  options?: ColorScriptAuditSummaryOptions,
): string {
  const verdict = colorScript.overallPassed ? "출고 적합" : "보정 필요";
  const lines: string[] = [];

  lines.push(`# 감정 색채 스크립트 검토 보고서 — ${colorScript.episodeTitleKo}`);
  lines.push(
    `- 에피소드 ID: ${colorScript.episodeId} · 총 ${String(colorScript.scenes.length)}개 장면 · 종합 판정: ${verdict}`,
  );
  if (options?.generatedDateIso !== undefined) {
    lines.push(`- 점검 기준일: ${options.generatedDateIso}`);
  }
  lines.push("");

  // 1. 장면별 조명·색채 전환 흐름
  lines.push("## 1. 장면별 색채 흐름 및 인접 전환");
  if (colorScript.scenes.length === 0) {
    lines.push("- 점검할 장면이 등록되지 않았습니다.");
  } else {
    for (let i = 0; i < colorScript.scenes.length; i += 1) {
      const sc = colorScript.scenes[i];
      const arcKo = EMOTION_ARC_LABEL_KO[sc.emotionArc];
      const stepNote =
        sc.deltaEFromPreviousScene === null
          ? "도입 장면"
          : `직전 대비 ΔE ${sc.deltaEFromPreviousScene.toFixed(3)}`;
      lines.push(
        `- [${String(i + 1)}화·${sc.sceneId}] ${sc.titleKo} (${arcKo} / ${sc.presetLabelKo}): 우세 OKLCH(L=${sc.dominantOklch.l.toFixed(2)}, C=${sc.dominantOklch.c.toFixed(3)}, H=${sc.dominantOklch.h.toFixed(1)}°), 명암 폭 ${sc.luminanceSpan.toFixed(2)}, ${stepNote}`,
      );
    }
  }
  lines.push("");

  // 2. 피부색 보호 & 암부 채도 유지
  lines.push("## 2. 피부색 기억색 보호 및 암부 탁함 방지(Anti-Mud)");
  lines.push(
    colorScript.allSkinProtected
      ? `- 피부색 보호 통과: 모든 장면의 피부 색상각 편차가 최대 ${colorScript.maxSkinHueDriftDeg.toFixed(1)}° 이내로 유지돼 인물 혈색이 깨지지 않았습니다.`
      : `- 피부색 보정 필요: 최대 피부 색상각 편차가 ${colorScript.maxSkinHueDriftDeg.toFixed(1)}°에 달해 강한 환경광 장면의 피부 앵커 강도를 높여야 합니다.`,
  );
  lines.push(
    colorScript.allAntiMudPassed
      ? `- 암부 탁함 방지 통과: 최소 암부 채도 유지율 ${Math.round(colorScript.minShadowChromaRetention * 100)}%로 그림자가 회색빛으로 탁해지지 않았습니다.`
      : `- 암부 보정 필요: 최소 암부 채도 유지율이 ${Math.round(colorScript.minShadowChromaRetention * 100)}%로 떨어져 환경광 보색 음영 보정이 필요합니다.`,
  );
  lines.push("");

  // 3. 감정 절정 대비 & WCAG 말풍선 가독성
  lines.push("## 3. 감정 절정 대비 정점 및 말풍선 가독성(WCAG 2.1)");
  const cv = colorScript.climaxVerification;
  if (!cv.hasClimaxScene) {
    lines.push("- 절정(climax) 구간이 없는 에피소드로, 장면 전환 안정성만 점검했습니다.");
  } else if (cv.peakAchieved) {
    lines.push(
      `- 절정 구간 정점 확인(${cv.climaxSceneIds.join(", ")}): 선행 안정 구간 대비 명암 폭 ${cv.contrastLiftOverCalm >= 0 ? "+" : ""}${cv.contrastLiftOverCalm.toFixed(2)}, 채도 ${cv.chromaLiftOverCalm >= 0 ? "+" : ""}${cv.chromaLiftOverCalm.toFixed(3)} 상승해 시각적 긴장감이 분명히 살아납니다.`,
    );
  } else {
    lines.push(
      `- 절정 구간 대비 보강 필요(${cv.climaxSceneIds.join(", ")}): 선행 안정 장면보다 명암 폭이나 채도 임팩트가 낮아 절정 조명 대비를 더 키워야 합니다.`,
    );
  }

  if (colorScript.allBalloonWcagPassed) {
    lines.push(
      `- 말풍선 가독성 통과: 전 장면 최소 대비율 ${colorScript.minObservedBalloonWcagRatio.toFixed(2)}:1 (기준 ${colorScript.minBalloonWcagRatio.toFixed(1)}:1 이상).`,
    );
  } else {
    lines.push(
      `- 말풍선 가독성 미달(${colorScript.failingWcagSceneIds.join(", ")}): 최소 대비율 ${colorScript.minObservedBalloonWcagRatio.toFixed(2)}:1로 기준(${colorScript.minBalloonWcagRatio.toFixed(1)}:1)에 못 미칩니다. 권장 고대비 글자색 또는 불투명 말풍선 배경으로 교체하세요.`,
    );
  }

  return lines.join("\n");
}
