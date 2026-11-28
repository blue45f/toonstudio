/**
 * Wave 151 — 순수 OKLCH 도시 야경 3-심도 스카이라인 · 실내 시차 창문 · 네온 간판 검수 SVG 렌더러
 * (원시 hex/rgb/hsl 0건, XML/XSS 이스케이프, NaN/Infinity 0건) 및
 * 자연스러운 한국어 배경 감독 QA 브리프 생성기.
 */

import {
  clampFinite,
  formatOklchCss,
  formatSafeDecimal,
  getCityscapeMoodPreset,
  type CityscapeBuilding,
  type CityscapeDepthBand,
  type CityscapeNightMoodId,
  type CityscapeNightScene,
  type KeepOutBox2D,
  type PlacedNeonSignboard,
} from "./cityscape-night-types";
import type { CityscapeNightHarmonyAudit } from "./night-color-harmony-and-atmosphere";

const SVG_TOKENS = {
  sheetBg: "oklch(0.145 0.018 252)",
  panelBg: "oklch(0.190 0.020 250)",
  panelBorder: "oklch(0.320 0.024 248)",
  textPrimary: "oklch(0.955 0.010 92)",
  textMuted: "oklch(0.765 0.016 246)",
  badgePassBg: "oklch(0.310 0.075 156)",
  badgePassInk: "oklch(0.910 0.040 156)",
  badgeWarnBg: "oklch(0.340 0.095 36)",
  badgeWarnInk: "oklch(0.930 0.045 48)",
  keepOutStroke: "oklch(0.680 0.175 26)",
  keepOutFill: "oklch(0.620 0.145 26 / 0.14)",
  blindFill: "oklch(0.155 0.016 250 / 0.62)",
  signBacking: "oklch(0.140 0.018 255 / 0.88)",
  signText: "oklch(0.975 0.012 95)",
  dominantBar: "oklch(0.330 0.042 254)",
  secondaryBar: "oklch(0.780 0.125 74)",
  accentBar: "oklch(0.680 0.195 338)",
  fgMeter: "oklch(0.720 0.165 208)",
  midMeter: "oklch(0.620 0.105 225)",
  bgMeter: "oklch(0.490 0.048 244)",
  roadSurface: "oklch(0.130 0.020 252)",
  moonGlow: "oklch(0.880 0.030 236 / 0.22)",
} as const;

export interface CityscapeNightSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly customTitle?: string;
  readonly showKeepOutOverlay?: boolean;
  readonly showHarmonyRatioBar?: boolean;
}

export interface CityscapeNightDirectorBriefKo {
  readonly verdict: "ready" | "needs-harmony-fix" | "needs-layout-review";
  readonly moodId: CityscapeNightMoodId;
  readonly hourOfNight: number;
  readonly headlineKo: string;
  readonly bulletsKo: readonly string[];
  readonly reportTextKo: string;
  readonly overallOccupancyRatio: number;
  readonly averageRowHashRepetitionRate: number;
  readonly placedSignCount: number;
  readonly signOverlapCount: number;
  readonly keepOutViolationCount: number;
  readonly harmonyScore: number;
  readonly dominantRatio: number;
  readonly secondaryRatio: number;
  readonly accentRatio: number;
  readonly isDepthChromaMonotonic: boolean;
  readonly manifestSha256Hex: string;
}

/**
 * XML/SVG 특수문자(`<`, `>`, `&`, `"`, `'`)를 완전히 이스케이프한다.
 */
export function escapeCityscapeSvgXml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function renderSignboardSvg(
  sign: PlacedNeonSignboard,
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): string {
  const sx = offsetX + sign.rect.x * scaleX;
  const sy = offsetY + sign.rect.y * scaleY;
  const sw = Math.max(12, sign.rect.width * scaleX);
  const sh = Math.max(12, sign.rect.height * scaleY);
  const scaleMin = Math.min(scaleX, scaleY);
  const fontSize = clampFinite(sign.fontSizePx * scaleMin, 6.5, 22, 10);
  const glowStrokeW = clampFinite(sign.glowRadiusPx * scaleMin * 0.35, 1.5, 6.5, 2.8);
  const idEsc = escapeCityscapeSvgXml(sign.id);
  const glowColor = formatOklchCss({
    l: sign.accentColorOklch.l,
    c: sign.accentColorOklch.c,
    h: sign.accentColorOklch.h,
    alpha: 0.36,
  });

  if (sign.orientation === "vertical") {
    const chars = Array.from(sign.text.trim() || "NEON").slice(0, 12);
    const stepY = (sh - 6) / Math.max(1, chars.length);
    const startY = sy + 3 + stepY * 0.68;
    const cx = sx + sw * 0.5;
    const tspans = chars
      .map((ch, idx) => {
        const cy = startY + idx * stepY;
        return `<tspan x="${formatSafeDecimal(cx, 2)}" y="${formatSafeDecimal(cy, 2)}">${escapeCityscapeSvgXml(ch)}</tspan>`;
      })
      .join("");
    return [
      `      <g data-sign-id="${idEsc}" data-sign-orientation="vertical" data-sign-script="${sign.script}">`,
      `        <rect x="${formatSafeDecimal(sx - 1.5, 2)}" y="${formatSafeDecimal(sy - 1.5, 2)}" width="${formatSafeDecimal(sw + 3, 2)}" height="${formatSafeDecimal(sh + 3, 2)}" rx="4" fill="none" stroke="${glowColor}" stroke-width="${formatSafeDecimal(glowStrokeW, 2)}" />`,
      `        <rect x="${formatSafeDecimal(sx, 2)}" y="${formatSafeDecimal(sy, 2)}" width="${formatSafeDecimal(sw, 2)}" height="${formatSafeDecimal(sh, 2)}" rx="3" fill="${SVG_TOKENS.signBacking}" stroke="${sign.accentColorCss}" stroke-width="1.35" />`,
      `        <text text-anchor="middle" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="${formatSafeDecimal(fontSize * 0.85, 2)}" font-weight="700" fill="${SVG_TOKENS.signText}">${tspans}</text>`,
      `      </g>`,
    ].join("\n");
  }

  const textEsc = escapeCityscapeSvgXml(sign.text);
  const cx = sx + sw * 0.5;
  const cy = sy + sh * 0.64;
  return [
    `      <g data-sign-id="${idEsc}" data-sign-orientation="horizontal" data-sign-script="${sign.script}">`,
    `        <rect x="${formatSafeDecimal(sx - 1.5, 2)}" y="${formatSafeDecimal(sy - 1.5, 2)}" width="${formatSafeDecimal(sw + 3, 2)}" height="${formatSafeDecimal(sh + 3, 2)}" rx="4" fill="none" stroke="${glowColor}" stroke-width="${formatSafeDecimal(glowStrokeW, 2)}" />`,
    `        <rect x="${formatSafeDecimal(sx, 2)}" y="${formatSafeDecimal(sy, 2)}" width="${formatSafeDecimal(sw, 2)}" height="${formatSafeDecimal(sh, 2)}" rx="3" fill="${SVG_TOKENS.signBacking}" stroke="${sign.accentColorCss}" stroke-width="1.35" />`,
    `        <text x="${formatSafeDecimal(cx, 2)}" y="${formatSafeDecimal(cy, 2)}" text-anchor="middle" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="${formatSafeDecimal(fontSize * 0.88, 2)}" font-weight="700" fill="${SVG_TOKENS.signText}">${textEsc}</text>`,
    `      </g>`,
  ].join("\n");
}

function renderBuildingSvg(
  building: CityscapeBuilding,
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): string {
  const bx = offsetX + building.rect.x * scaleX;
  const by = offsetY + building.rect.y * scaleY;
  const bw = Math.max(8, building.rect.width * scaleX);
  const bh = Math.max(8, building.rect.height * scaleY);
  const strokeCss = formatOklchCss({
    l: clampFinite(building.facadeBaseOklch.l + 0.08, 0.14, 0.52, 0.30),
    c: building.facadeBaseOklch.c,
    h: building.facadeBaseOklch.h,
  });

  const windowLines: string[] = [];
  for (const w of building.facadeWindows.windows) {
    const wx = offsetX + w.rect.x * scaleX;
    const wy = offsetY + w.rect.y * scaleY;
    const ww = Math.max(2, w.rect.width * scaleX);
    const wh = Math.max(2, w.rect.height * scaleY);

    windowLines.push(
      `        <rect x="${formatSafeDecimal(wx, 2)}" y="${formatSafeDecimal(wy, 2)}" width="${formatSafeDecimal(ww, 2)}" height="${formatSafeDecimal(wh, 2)}" rx="0.8" fill="${w.oklchCss}" data-window-lit="${w.lit ? "true" : "false"}" />`,
    );

    if (w.lit) {
      // 실내 시차 뒷벽 하이라이트 + 상단 블라인드 마스크 표현
      const innerW = Math.max(1.2, ww * 0.56);
      const innerH = Math.max(1.2, wh * 0.52);
      const shiftX = clampFinite(w.parallax.backWallOffsetU * ww * 0.65, -ww * 0.2, ww * 0.2, 0);
      const shiftY = clampFinite(w.parallax.backWallOffsetV * wh * 0.65, -wh * 0.2, wh * 0.2, 0);
      const ix = clampFinite(wx + (ww - innerW) * 0.5 + shiftX, wx, wx + ww - innerW, wx);
      const iy = clampFinite(wy + (wh - innerH) * 0.5 + shiftY, wy, wy + wh - innerH, wy);
      const innerHighlight = formatOklchCss({
        l: clampFinite(w.oklch.l + 0.09, 0.25, 0.96, 0.82),
        c: clampFinite(w.oklch.c * 0.9, 0.01, 0.24, 0.06),
        h: w.oklch.h,
        alpha: 0.72,
      });
      windowLines.push(
        `        <rect x="${formatSafeDecimal(ix, 2)}" y="${formatSafeDecimal(iy, 2)}" width="${formatSafeDecimal(innerW, 2)}" height="${formatSafeDecimal(innerH, 2)}" fill="${innerHighlight}" />`,
      );
      if (w.blindClosureRatio > 0.08) {
        const blindH = Math.max(1, wh * clampFinite(w.blindClosureRatio, 0, 0.82, 0.2));
        windowLines.push(
          `        <rect x="${formatSafeDecimal(wx, 2)}" y="${formatSafeDecimal(wy, 2)}" width="${formatSafeDecimal(ww, 2)}" height="${formatSafeDecimal(blindH, 2)}" fill="${SVG_TOKENS.blindFill}" />`,
        );
      }
    }
  }

  const signLines = building.signboards.map((s) => renderSignboardSvg(s, offsetX, offsetY, scaleX, scaleY));

  return [
    `    <g data-building-id="${escapeCityscapeSvgXml(building.id)}" data-depth-band="${building.depthBand}">`,
    `      <rect x="${formatSafeDecimal(bx, 2)}" y="${formatSafeDecimal(by, 2)}" width="${formatSafeDecimal(bw, 2)}" height="${formatSafeDecimal(bh, 2)}" fill="${building.facadeBaseCss}" stroke="${strokeCss}" stroke-width="1" />`,
    ...windowLines,
    ...signLines,
    `    </g>`,
  ].join("\n");
}

function renderKeepOutOverlaysSvg(
  boxes: readonly KeepOutBox2D[],
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): string {
  if (boxes.length === 0) return "";
  return boxes
    .map((box) => {
      const x = offsetX + box.x * scaleX;
      const y = offsetY + box.y * scaleY;
      const w = Math.max(8, box.width * scaleX);
      const h = Math.max(8, box.height * scaleY);
      return [
        `    <g data-keepout-box="${escapeCityscapeSvgXml(box.id)}">`,
        `      <rect x="${formatSafeDecimal(x, 2)}" y="${formatSafeDecimal(y, 2)}" width="${formatSafeDecimal(w, 2)}" height="${formatSafeDecimal(h, 2)}" rx="6" fill="${SVG_TOKENS.keepOutFill}" stroke="${SVG_TOKENS.keepOutStroke}" stroke-width="1.6" stroke-dasharray="6 4" />`,
        `      <text x="${formatSafeDecimal(x + 6, 2)}" y="${formatSafeDecimal(y + 15, 2)}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="10.5" font-weight="600" fill="${SVG_TOKENS.keepOutStroke}">${escapeCityscapeSvgXml(box.labelKo)}</text>`,
        `    </g>`,
      ].join("\n");
    })
    .join("\n");
}

/**
 * 3-심도(원경/중경/근경) 빌딩 실루엣, 실내 시차 창문 격자, 무충돌 네온 간판,
 * 60-30-10 색조 비율 바를 순수 OKLCH SVG 문자열로 렌더링한다.
 */
export function renderCityscapeNightAuditSvg(
  scene: CityscapeNightScene,
  audit: CityscapeNightHarmonyAudit,
  options?: CityscapeNightSvgOptions,
): string {
  const width = Math.round(clampFinite(options?.widthPx ?? 960, 560, 2200, 960));
  const height = Math.round(clampFinite(options?.heightPx ?? 640, 420, 1600, 640));
  const showKeepOut = options?.showKeepOutOverlay ?? true;
  const showRatioBar = options?.showHarmonyRatioBar ?? true;

  const preset = getCityscapeMoodPreset(scene.moodId);
  const titleText = escapeCityscapeSvgXml(
    options?.customTitle ?? `${preset.labelKo} · ${scene.hourOfNight}시 야경 검수 시트`,
  );
  const subtitleText = escapeCityscapeSvgXml(
    `점등률 ${(scene.overallOccupancyRatio * 100).toFixed(1)}% · 행 반복률 ${(scene.averageRowHashRepetitionRate * 100).toFixed(1)}% · 조화 점수 ${audit.harmonyScore.toFixed(1)}점 · 겹침 ${scene.signOverlapCount}건`,
  );

  const headerH = 58;
  const footerH = showRatioBar ? 92 : 16;
  const padX = 20;
  const canvasX = padX;
  const canvasY = headerH + 8;
  const canvasW = width - padX * 2;
  const canvasH = Math.max(180, height - canvasY - footerH - 12);
  const scaleX = canvasW / Math.max(1, scene.viewportWidthPx);
  const scaleY = canvasH / Math.max(1, scene.viewportHeightPx);

  const skyZenithCss = formatOklchCss(scene.skyZenithOklch);
  const skyHorizonCss = formatOklchCss(scene.skyHorizonOklch);
  const hazeOverlayCss = formatOklchCss({
    l: scene.hazeOklch.l,
    c: scene.hazeOklch.c,
    h: scene.hazeOklch.h,
    alpha: 0.24,
  });

  const depthOrder: readonly CityscapeDepthBand[] = ["background", "midground", "foreground"];
  const orderedBuildings: CityscapeBuilding[] = [];
  for (const band of depthOrder) {
    for (const b of scene.buildings) {
      if (b.depthBand === band) orderedBuildings.push(b);
    }
  }

  const buildingSvgBlocks = orderedBuildings.map((b) =>
    renderBuildingSvg(b, canvasX, canvasY, scaleX, scaleY),
  );
  const keepOutSvg = showKeepOut
    ? renderKeepOutOverlaysSvg(scene.keepOutBoxes, canvasX, canvasY, scaleX, scaleY)
    : "";

  const roadY = canvasY + canvasH * 0.84;
  const roadH = Math.max(16, canvasY + canvasH - roadY);

  const badgeBg = audit.passed ? SVG_TOKENS.badgePassBg : SVG_TOKENS.badgeWarnBg;
  const badgeInk = audit.passed ? SVG_TOKENS.badgePassInk : SVG_TOKENS.badgeWarnInk;
  const badgeLabel = audit.passed ? "조화 통과" : "보정 권장";

  const footerY = canvasY + canvasH + 14;
  const barX = padX + 14;
  const barY = footerY + 34;
  const barW = Math.round(canvasW * 0.56);
  const barH = 18;
  const domW = Math.max(4, barW * clampFinite(audit.dominantRatio, 0, 1, 0.6));
  const secW = Math.max(4, barW * clampFinite(audit.secondaryRatio, 0, 1, 0.3));
  const accW = Math.max(4, barW - domW - secW);

  const meterX = barX + barW + 26;
  const meterMaxW = Math.max(90, canvasW - barW - 76);
  const fgC = audit.depthBandMetrics.foreground.meanChroma;
  const midC = audit.depthBandMetrics.midground.meanChroma;
  const bgC = audit.depthBandMetrics.background.meanChroma;
  const maxChroma = Math.max(0.18, fgC, midC, bgC);

  const footerSection = showRatioBar
    ? [
        `  <g data-harmony-ratio-bar="60-30-10">`,
        `    <rect x="${padX}" y="${formatSafeDecimal(footerY, 2)}" width="${canvasW}" height="${footerH - 8}" rx="10" fill="${SVG_TOKENS.panelBg}" stroke="${SVG_TOKENS.panelBorder}" stroke-width="1" />`,
        `    <text x="${barX}" y="${formatSafeDecimal(footerY + 22, 2)}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11.5" font-weight="600" fill="${SVG_TOKENS.textPrimary}">야간 60-30-10 색조 비율 (주조 ${(audit.dominantRatio * 100).toFixed(1)}% · 보조 ${(audit.secondaryRatio * 100).toFixed(1)}% · 액센트 ${(audit.accentRatio * 100).toFixed(1)}%)</text>`,
        `    <rect x="${barX}" y="${formatSafeDecimal(barY, 2)}" width="${formatSafeDecimal(domW, 2)}" height="${barH}" rx="3" fill="${SVG_TOKENS.dominantBar}" data-ratio-segment="dominant" />`,
        `    <rect x="${formatSafeDecimal(barX + domW, 2)}" y="${formatSafeDecimal(barY, 2)}" width="${formatSafeDecimal(secW, 2)}" height="${barH}" fill="${SVG_TOKENS.secondaryBar}" data-ratio-segment="secondary" />`,
        `    <rect x="${formatSafeDecimal(barX + domW + secW, 2)}" y="${formatSafeDecimal(barY, 2)}" width="${formatSafeDecimal(accW, 2)}" height="${barH}" rx="3" fill="${SVG_TOKENS.accentBar}" data-ratio-segment="accent" />`,
        `    <text x="${barX}" y="${formatSafeDecimal(barY + 34, 2)}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="10.5" fill="${SVG_TOKENS.textMuted}">네온 색상군 ${audit.distinctNeonHueCount}종 · SHA-256 ${escapeCityscapeSvgXml(audit.manifestSha256Hex.slice(0, 12))}</text>`,
        `    <text x="${formatSafeDecimal(meterX, 2)}" y="${formatSafeDecimal(footerY + 22, 2)}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11.5" font-weight="600" fill="${SVG_TOKENS.textPrimary}">원근 대기 채도 감쇠 (${audit.isDepthChromaMonotonic ? "단조 감소 정상" : "감쇠 역전 경고"})</text>`,
        `    <rect x="${formatSafeDecimal(meterX, 2)}" y="${formatSafeDecimal(footerY + 32, 2)}" width="${formatSafeDecimal((fgC / maxChroma) * meterMaxW, 2)}" height="9" rx="2" fill="${SVG_TOKENS.fgMeter}" />`,
        `    <rect x="${formatSafeDecimal(meterX, 2)}" y="${formatSafeDecimal(footerY + 46, 2)}" width="${formatSafeDecimal((midC / maxChroma) * meterMaxW, 2)}" height="9" rx="2" fill="${SVG_TOKENS.midMeter}" />`,
        `    <rect x="${formatSafeDecimal(meterX, 2)}" y="${formatSafeDecimal(footerY + 60, 2)}" width="${formatSafeDecimal((bgC / maxChroma) * meterMaxW, 2)}" height="9" rx="2" fill="${SVG_TOKENS.bgMeter}" />`,
        `  </g>`,
      ].join("\n")
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${titleText}">`,
    `  <defs>`,
    `    <linearGradient id="wave151-night-sky" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `      <stop offset="0%" stop-color="${skyZenithCss}" />`,
    `      <stop offset="100%" stop-color="${skyHorizonCss}" />`,
    `    </linearGradient>`,
    `    <clipPath id="wave151-viewport-clip">`,
    `      <rect x="${canvasX}" y="${canvasY}" width="${canvasW}" height="${formatSafeDecimal(canvasH, 2)}" rx="10" />`,
    `    </clipPath>`,
    `  </defs>`,
    `  <rect x="0" y="0" width="${width}" height="${height}" fill="${SVG_TOKENS.sheetBg}" />`,
    `  <g data-header="true">`,
    `    <text x="${padX}" y="28" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="16" font-weight="700" fill="${SVG_TOKENS.textPrimary}">${titleText}</text>`,
    `    <text x="${padX}" y="48" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11.5" fill="${SVG_TOKENS.textMuted}">${subtitleText}</text>`,
    `    <rect x="${width - padX - 86}" y="16" width="86" height="26" rx="13" fill="${badgeBg}" />`,
    `    <text x="${width - padX - 43}" y="33" text-anchor="middle" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11.5" font-weight="700" fill="${badgeInk}">${badgeLabel}</text>`,
    `  </g>`,
    `  <g clip-path="url(#wave151-viewport-clip)" data-scene-viewport="true">`,
    `    <rect x="${canvasX}" y="${canvasY}" width="${canvasW}" height="${formatSafeDecimal(canvasH, 2)}" fill="url(#wave151-night-sky)" />`,
    `    <circle cx="${formatSafeDecimal(canvasX + canvasW * 0.82, 2)}" cy="${formatSafeDecimal(canvasY + canvasH * 0.16, 2)}" r="46" fill="${SVG_TOKENS.moonGlow}" />`,
    `    <rect x="${canvasX}" y="${formatSafeDecimal(canvasY + canvasH * 0.42, 2)}" width="${canvasW}" height="${formatSafeDecimal(canvasH * 0.44, 2)}" fill="${hazeOverlayCss}" />`,
    ...buildingSvgBlocks,
    `    <rect x="${canvasX}" y="${formatSafeDecimal(roadY, 2)}" width="${canvasW}" height="${formatSafeDecimal(roadH, 2)}" fill="${SVG_TOKENS.roadSurface}" />`,
    keepOutSvg,
    `  </g>`,
    `  <rect x="${canvasX}" y="${canvasY}" width="${canvasW}" height="${formatSafeDecimal(canvasH, 2)}" rx="10" fill="none" stroke="${SVG_TOKENS.panelBorder}" stroke-width="1.2" />`,
    footerSection,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 웹툰 배경 감독이 바로 검수·수정 지시에 쓸 수 있는 자연스러운 한국어 야경 QA 브리프를 작성한다.
 */
export function summarizeCityscapeNightAuditKo(
  scene: CityscapeNightScene,
  audit: CityscapeNightHarmonyAudit,
): CityscapeNightDirectorBriefKo {
  const preset = getCityscapeMoodPreset(scene.moodId);
  const placedSignCount = scene.buildings.reduce((sum, b) => sum + b.signboards.length, 0);
  const layoutViolations =
    scene.signOverlapCount + scene.keepOutViolationCount + scene.outOfBoundsSignCount;

  const verdict: CityscapeNightDirectorBriefKo["verdict"] =
    layoutViolations > 0
      ? "needs-layout-review"
      : audit.passed
        ? "ready"
        : "needs-harmony-fix";

  const headlineKo =
    verdict === "ready"
      ? `[출고 가능] ${preset.labelKo} ${scene.hourOfNight}시 야경 — 창문 점등과 네온 배색이 안정적입니다.`
      : verdict === "needs-layout-review"
        ? `[배치 확인 필요] ${preset.labelKo} ${scene.hourOfNight}시 야경 — 간판 겹침 또는 주인공 보호 구역 침범이 남아 있습니다.`
        : `[색조 보정 권장] ${preset.labelKo} ${scene.hourOfNight}시 야경 — 네온 과밀이나 원경 대기 감쇠를 다듬어야 합니다.`;

  const bulletsKo: string[] = [
    `창문 점등률은 ${(scene.overallOccupancyRatio * 100).toFixed(1)}%이며, 층별 패턴 반복률은 ${(scene.averageRowHashRepetitionRate * 100).toFixed(1)}%로 기계적 복제 느낌을 피했습니다.`,
    `네온 간판 ${placedSignCount}개를 건물 경계 안에 배치했습니다(간판 겹침 ${scene.signOverlapCount}건, 주인공 보호 구역 침범 ${scene.keepOutViolationCount}건).`,
    `60-30-10 야간 색조 비중은 주조 ${(audit.dominantRatio * 100).toFixed(1)}% · 보조 ${(audit.secondaryRatio * 100).toFixed(1)}% · 액센트 ${(audit.accentRatio * 100).toFixed(1)}%이며, 조화 점수는 ${audit.harmonyScore.toFixed(1)}점입니다.`,
    audit.isDepthChromaMonotonic
      ? `근경(${audit.depthBandMetrics.foreground.meanChroma.toFixed(3)}) → 중경(${audit.depthBandMetrics.midground.meanChroma.toFixed(3)}) → 원경(${audit.depthBandMetrics.background.meanChroma.toFixed(3)}) 순으로 채도가 자연스럽게 빠집니다.`
      : "원경 건물의 채도나 명도가 근경보다 튀어 보여 거리 대기 감쇠 재보정이 필요합니다.",
  ];

  for (const issue of audit.issues) {
    bulletsKo.push(`[${issue.severity === "error" ? "필수 수정" : "참고"}] ${issue.messageKo}`);
  }

  const reportTextKo = [headlineKo, ...bulletsKo.map((line) => `- ${line}`)].join("\n");

  return {
    verdict,
    moodId: scene.moodId,
    hourOfNight: scene.hourOfNight,
    headlineKo,
    bulletsKo,
    reportTextKo,
    overallOccupancyRatio: scene.overallOccupancyRatio,
    averageRowHashRepetitionRate: scene.averageRowHashRepetitionRate,
    placedSignCount,
    signOverlapCount: scene.signOverlapCount,
    keepOutViolationCount: scene.keepOutViolationCount,
    harmonyScore: audit.harmonyScore,
    dominantRatio: audit.dominantRatio,
    secondaryRatio: audit.secondaryRatio,
    accentRatio: audit.accentRatio,
    isDepthChromaMonotonic: audit.isDepthChromaMonotonic,
    manifestSha256Hex: audit.manifestSha256Hex,
  };
}
