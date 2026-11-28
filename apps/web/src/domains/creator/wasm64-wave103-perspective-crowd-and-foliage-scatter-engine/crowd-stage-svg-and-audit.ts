/**
 * Wave 103 — OKLCH 인쇄 안전 원근 군중·식생 SVG 스테이지 렌더러 및 한국어 배경 연출 감사 리포트.
 *
 * - 원색 16진수/RGB 리터럴 없이 순수 OKLCH 색공간으로만 대기 원근감(명도 상승·채도 감쇠)을 표현
 * - 점선 지평선, 수렴 원근 그리드, 주인공·말풍선 보호구역 프레임, 원경→근경 실루엣 렌더링
 * - NaN/Infinity 차단 및 XML 이스케이프 처리, 번역투 없는 한국어 배경 감독 리포트 생성
 */

import {
  clampNumber,
  generatePerspectiveGroundGrid,
  resolvePrincipalXPx,
} from "./horizon-perspective-projection-and-density";
import type {
  CrowdScatterResult,
  KeepOutRole,
  PlacedScatterEntity,
  ScatterArchetypeId,
} from "./poisson-crowd-and-foliage-scatter-solver";

export type CrowdStageSvgTheme = "light" | "dark";

export interface CrowdStageSvgOptions {
  readonly title?: string;
  readonly theme?: CrowdStageSvgTheme;
  readonly showPerspectiveGrid?: boolean;
  readonly showKeepOutZones?: boolean;
  readonly showEyeLevelTicks?: boolean;
}

export interface CrowdScatterAuditKo {
  readonly statusBadgeKo: "통과" | "주의" | "실패";
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly bulletLinesKo: readonly string[];
  readonly warningsKo: readonly string[];
}

interface StageOklchPalette {
  readonly skyBg: string;
  readonly groundBg: string;
  readonly frameStroke: string;
  readonly gridLine: string;
  readonly horizonStroke: string;
  readonly badgeBg: string;
  readonly badgeBorder: string;
  readonly textPrimary: string;
  readonly textMuted: string;
  readonly shadowFill: string;
  readonly eyeTickStroke: string;
  readonly keepOut: Readonly<Record<KeepOutRole, { readonly stroke: string; readonly fill: string }>>;
}

const PALETTES: Readonly<Record<CrowdStageSvgTheme, StageOklchPalette>> = {
  light: {
    skyBg: "oklch(0.972 0.010 88)",
    groundBg: "oklch(0.942 0.015 84)",
    frameStroke: "oklch(0.320 0.045 158)",
    gridLine: "oklch(0.660 0.020 228 / 0.42)",
    horizonStroke: "oklch(0.560 0.165 44)",
    badgeBg: "oklch(0.992 0.004 88 / 0.94)",
    badgeBorder: "oklch(0.760 0.018 158)",
    textPrimary: "oklch(0.220 0.028 158)",
    textMuted: "oklch(0.450 0.020 158)",
    shadowFill: "oklch(0.280 0.020 158 / 0.18)",
    eyeTickStroke: "oklch(0.560 0.165 44 / 0.72)",
    keepOut: {
      "hero-silhouette": { stroke: "oklch(0.520 0.180 28)", fill: "oklch(0.520 0.180 28 / 0.10)" },
      "speech-balloon": { stroke: "oklch(0.460 0.145 254)", fill: "oklch(0.460 0.145 254 / 0.10)" },
      "focal-corridor": { stroke: "oklch(0.440 0.115 156)", fill: "oklch(0.440 0.115 156 / 0.08)" },
    },
  },
  dark: {
    skyBg: "oklch(0.185 0.014 162)",
    groundBg: "oklch(0.225 0.016 158)",
    frameStroke: "oklch(0.680 0.060 158)",
    gridLine: "oklch(0.520 0.024 220 / 0.36)",
    horizonStroke: "oklch(0.760 0.155 68)",
    badgeBg: "oklch(0.205 0.016 160 / 0.92)",
    badgeBorder: "oklch(0.460 0.036 158)",
    textPrimary: "oklch(0.945 0.010 88)",
    textMuted: "oklch(0.760 0.016 158)",
    shadowFill: "oklch(0.100 0.010 160 / 0.42)",
    eyeTickStroke: "oklch(0.760 0.155 68 / 0.75)",
    keepOut: {
      "hero-silhouette": { stroke: "oklch(0.720 0.175 28)", fill: "oklch(0.720 0.175 28 / 0.14)" },
      "speech-balloon": { stroke: "oklch(0.740 0.140 248)", fill: "oklch(0.740 0.140 248 / 0.14)" },
      "focal-corridor": { stroke: "oklch(0.740 0.125 156)", fill: "oklch(0.740 0.125 156 / 0.12)" },
    },
  },
};

const ARCHETYPE_OKLCH: Readonly<
  Record<
    ScatterArchetypeId,
    { readonly lightL: number; readonly darkL: number; readonly chroma: number; readonly hue: number }
  >
> = {
  "bystander-walker": { lightL: 0.31, darkL: 0.74, chroma: 0.048, hue: 238 },
  "bystander-commuter": { lightL: 0.28, darkL: 0.7, chroma: 0.042, hue: 256 },
  "student-uniform": { lightL: 0.34, darkL: 0.78, chroma: 0.062, hue: 222 },
  "fantasy-soldier": { lightL: 0.32, darkL: 0.72, chroma: 0.072, hue: 34 },
  "street-tree": { lightL: 0.44, darkL: 0.66, chroma: 0.095, hue: 148 },
  "cherry-blossom-canopy": { lightL: 0.68, darkL: 0.78, chroma: 0.092, hue: 350 },
  "street-lamp": { lightL: 0.36, darkL: 0.74, chroma: 0.035, hue: 84 },
};

const KEEP_OUT_ROLE_LABELS_KO: Readonly<Record<KeepOutRole, string>> = {
  "hero-silhouette": "주인공 보호구역",
  "speech-balloon": "말풍선 보호구역",
  "focal-corridor": "시선 통로",
};

export function escapeXmlText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(value: number, digits = 2): string {
  return (Number.isFinite(value) ? value : 0).toFixed(digits);
}

function resolveEntityOklchColors(
  entity: PlacedScatterEntity,
  theme: CrowdStageSvgTheme,
): { readonly fill: string; readonly stroke: string; readonly accent: string } {
  const base = ARCHETYPE_OKLCH[entity.templateId];
  const style = entity.atmosphericStyle;
  const chroma = clampNumber(base.chroma * style.chromaScale, 0.006, 0.2);
  const fillL =
    theme === "dark"
      ? clampNumber(base.darkL - style.lightnessLift * 0.72, 0.32, 0.88)
      : clampNumber(base.lightL + style.lightnessLift, 0.22, 0.88);
  const strokeL =
    theme === "dark" ? clampNumber(fillL + 0.12, 0.42, 0.96) : clampNumber(fillL - 0.12, 0.14, 0.76);
  const accentL = clampNumber(fillL - 0.09, 0.16, 0.8);
  const alpha = fmt(style.silhouetteOpacity, 2);
  const strokeAlpha = fmt(clampNumber(style.silhouetteOpacity + 0.04, 0.36, 1), 2);
  const hue = fmt(base.hue, 1);

  return {
    fill: `oklch(${fmt(fillL, 3)} ${fmt(chroma, 3)} ${hue} / ${alpha})`,
    stroke: `oklch(${fmt(strokeL, 3)} ${fmt(chroma * 0.88, 3)} ${hue} / ${strokeAlpha})`,
    accent: `oklch(${fmt(accentL, 3)} ${fmt(chroma * 0.78, 3)} ${hue} / ${alpha})`,
  };
}

function renderHumanSilhouette(
  entity: PlacedScatterEntity,
  theme: CrowdStageSvgTheme,
  palette: StageOklchPalette,
  showEyeLevelTicks: boolean,
): string {
  const { fill, stroke, accent } = resolveEntityOklchColors(entity, theme);
  const { screenHeightPx: h, screenWidthPx: w, footScreenX: fx, footScreenY: fy } = entity;
  const dir = entity.mirrored ? -1 : 1;
  const sw = entity.atmosphericStyle.strokeWidthPx;
  const headR = Math.max(1.2, h * 0.068);
  const shoulderY = fy - h * 0.82;
  const hipY = fy - h * 0.48;
  const shW = w * 0.46;
  const hipW = w * 0.32;
  const stride =
    (entity.poseVariant.includes("stride") || entity.poseVariant.includes("hurry") ? 0.24 : 0.14) *
    w *
    dir;

  const bodyPts = [
    `${fmt(fx - shW)},${fmt(shoulderY)}`,
    `${fmt(fx + shW)},${fmt(shoulderY)}`,
    `${fmt(fx + hipW + stride * 0.25)},${fmt(hipY)}`,
    `${fmt(fx + stride)},${fmt(fy)}`,
    `${fmt(fx + stride * 0.2)},${fmt(fy)}`,
    `${fmt(fx)},${fmt(hipY + h * 0.06)}`,
    `${fmt(fx - stride * 0.25)},${fmt(fy)}`,
    `${fmt(fx - stride * 0.95)},${fmt(fy)}`,
    `${fmt(fx - hipW)},${fmt(hipY)}`,
  ].join(" ");

  const parts: string[] = [
    `<ellipse cx="${fmt(fx)}" cy="${fmt(fy)}" rx="${fmt(w * 0.45)}" ry="${fmt(Math.max(1.2, w * 0.12))}" fill="${palette.shadowFill}" />`,
    `<polygon points="${bodyPts}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(sw)}" stroke-linejoin="round" />`,
    `<circle cx="${fmt(fx)}" cy="${fmt(fy - h + headR)}" r="${fmt(headR)}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(sw)}" />`,
  ];

  if (entity.templateId === "fantasy-soldier") {
    const sx = fx + shW * 1.1 * dir;
    parts.push(
      `<line x1="${fmt(sx)}" y1="${fmt(fy)}" x2="${fmt(sx + w * 0.08 * dir)}" y2="${fmt(fy - h * 1.08)}" stroke="${accent}" stroke-width="${fmt(Math.max(0.8, sw * 1.05))}" stroke-linecap="round" />`,
    );
  } else if (entity.templateId === "bystander-commuter") {
    const bx = fx + shW * 0.9 * dir;
    parts.push(
      `<rect x="${fmt(bx - w * 0.16)}" y="${fmt(hipY + h * 0.06)}" width="${fmt(w * 0.32)}" height="${fmt(h * 0.14)}" rx="${fmt(Math.max(0.8, w * 0.05))}" fill="${accent}" stroke="${stroke}" stroke-width="${fmt(sw * 0.8)}" />`,
    );
  } else if (entity.templateId === "student-uniform") {
    const px = fx - shW * 0.72 * dir;
    parts.push(
      `<rect x="${fmt(px - w * 0.14)}" y="${fmt(shoulderY + h * 0.04)}" width="${fmt(w * 0.28)}" height="${fmt(h * 0.22)}" rx="${fmt(Math.max(0.8, w * 0.06))}" fill="${accent}" stroke="${stroke}" stroke-width="${fmt(sw * 0.75)}" />`,
    );
  }

  if (showEyeLevelTicks && entity.atmosphericStyle.detailTier !== "soft-background-wash") {
    parts.push(
      `<line x1="${fmt(fx - headR * 1.6)}" y1="${fmt(entity.eyeScreenY)}" x2="${fmt(fx + headR * 1.6)}" y2="${fmt(entity.eyeScreenY)}" stroke="${palette.eyeTickStroke}" stroke-width="${fmt(Math.max(0.6, sw * 0.55))}" />`,
    );
  }
  return parts.join("");
}

function renderFoliageSilhouette(
  entity: PlacedScatterEntity,
  theme: CrowdStageSvgTheme,
  palette: StageOklchPalette,
): string {
  const { fill, stroke } = resolveEntityOklchColors(entity, theme);
  const alpha = fmt(entity.atmosphericStyle.silhouetteOpacity, 2);
  const trunkFill =
    theme === "dark" ? `oklch(0.460 0.040 58 / ${alpha})` : `oklch(0.380 0.052 56 / ${alpha})`;
  const { screenHeightPx: h, screenWidthPx: w, footScreenX: fx, footScreenY: fy } = entity;
  const sw = entity.atmosphericStyle.strokeWidthPx;
  const lean =
    entity.poseVariant.includes("lean") || entity.poseVariant.includes("sweep")
      ? w * 0.08 * (entity.mirrored ? -1 : 1)
      : 0;
  const trunkTopY = fy - h * 0.42;
  const crownY = fy - h * 0.68;
  const baseW = Math.max(1.5, w * 0.07);
  const topW = Math.max(1.0, w * 0.042);
  const trunkPts = `${fmt(fx - baseW)},${fmt(fy)} ${fmt(fx + baseW)},${fmt(fy)} ${fmt(fx + lean + topW)},${fmt(trunkTopY)} ${fmt(fx + lean - topW)},${fmt(trunkTopY)}`;

  return [
    `<ellipse cx="${fmt(fx)}" cy="${fmt(fy)}" rx="${fmt(w * 0.34)}" ry="${fmt(Math.max(1.5, w * 0.08))}" fill="${palette.shadowFill}" />`,
    `<polygon points="${trunkPts}" fill="${trunkFill}" stroke="${stroke}" stroke-width="${fmt(sw * 0.75)}" />`,
    `<ellipse cx="${fmt(fx + lean - w * 0.18)}" cy="${fmt(crownY + h * 0.04)}" rx="${fmt(w * 0.28)}" ry="${fmt(h * 0.22)}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(sw * 0.85)}" />`,
    `<ellipse cx="${fmt(fx + lean + w * 0.18)}" cy="${fmt(crownY + h * 0.02)}" rx="${fmt(w * 0.27)}" ry="${fmt(h * 0.21)}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(sw * 0.85)}" />`,
    `<ellipse cx="${fmt(fx + lean)}" cy="${fmt(crownY - h * 0.08)}" rx="${fmt(w * 0.32)}" ry="${fmt(h * 0.25)}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(sw)}" />`,
  ].join("");
}

function renderStreetLampSilhouette(
  entity: PlacedScatterEntity,
  theme: CrowdStageSvgTheme,
  palette: StageOklchPalette,
): string {
  const { fill, stroke } = resolveEntityOklchColors(entity, theme);
  const alpha = fmt(entity.atmosphericStyle.silhouetteOpacity, 2);
  const glow =
    theme === "dark" ? `oklch(0.880 0.130 88 / ${alpha})` : `oklch(0.820 0.120 84 / ${alpha})`;
  const { screenHeightPx: h, screenWidthPx: w, footScreenX: fx, footScreenY: fy } = entity;
  const topY = fy - h;
  const sw = entity.atmosphericStyle.strokeWidthPx;
  const arm = w * 0.45 * (entity.mirrored ? -1 : 1);
  const parts: string[] = [
    `<ellipse cx="${fmt(fx)}" cy="${fmt(fy)}" rx="${fmt(Math.max(2, w * 0.26))}" ry="${fmt(Math.max(1, w * 0.07))}" fill="${palette.shadowFill}" />`,
    `<line x1="${fmt(fx)}" y1="${fmt(fy)}" x2="${fmt(fx)}" y2="${fmt(topY + h * 0.06)}" stroke="${stroke}" stroke-width="${fmt(Math.max(1.0, sw * 1.15))}" stroke-linecap="round" />`,
    `<line x1="${fmt(fx)}" y1="${fmt(topY + h * 0.08)}" x2="${fmt(fx + arm)}" y2="${fmt(topY + h * 0.04)}" stroke="${stroke}" stroke-width="${fmt(Math.max(0.8, sw * 0.9))}" stroke-linecap="round" />`,
    `<ellipse cx="${fmt(fx + arm)}" cy="${fmt(topY + h * 0.06)}" rx="${fmt(Math.max(1.5, w * 0.16))}" ry="${fmt(Math.max(1.2, h * 0.028))}" fill="${glow}" stroke="${fill}" stroke-width="${fmt(sw * 0.7)}" />`,
  ];
  if (entity.poseVariant === "double-lantern") {
    parts.push(
      `<line x1="${fmt(fx)}" y1="${fmt(topY + h * 0.08)}" x2="${fmt(fx - arm)}" y2="${fmt(topY + h * 0.04)}" stroke="${stroke}" stroke-width="${fmt(Math.max(0.8, sw * 0.9))}" stroke-linecap="round" />`,
      `<ellipse cx="${fmt(fx - arm)}" cy="${fmt(topY + h * 0.06)}" rx="${fmt(Math.max(1.5, w * 0.16))}" ry="${fmt(Math.max(1.2, h * 0.028))}" fill="${glow}" stroke="${fill}" stroke-width="${fmt(sw * 0.7)}" />`,
    );
  }
  return parts.join("");
}

/**
 * 원근 군중·식생 배치 결과를 인쇄 안전 고대비 OKLCH SVG로 렌더링한다.
 */
export function renderPerspectiveCrowdStageSvg(
  scatterResult: CrowdScatterResult,
  options?: CrowdStageSvgOptions,
): string {
  const { stage, entities, keepOutZones, metrics } = scatterResult;
  const theme: CrowdStageSvgTheme = options?.theme ?? "light";
  const palette = PALETTES[theme];
  const titleText = escapeXmlText(options?.title ?? "원근 지평선 잠금 군중·식생 배치 스테이지");
  const W = stage.viewportWidthPx;
  const H = stage.viewportHeightPx;
  const horizonY = stage.horizonYPx;
  const principalX = resolvePrincipalXPx(stage);
  const grid = generatePerspectiveGroundGrid(stage);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(W)} ${fmt(H)}" width="${fmt(W)}" height="${fmt(H)}" role="img" aria-label="${titleText}">`,
    `<title>${titleText}</title>`,
    `<rect x="0" y="0" width="${fmt(W)}" height="${fmt(horizonY)}" fill="${palette.skyBg}" />`,
    `<rect x="0" y="${fmt(horizonY)}" width="${fmt(W)}" height="${fmt(H - horizonY)}" fill="${palette.groundBg}" />`,
  ];

  if (options?.showPerspectiveGrid ?? true) {
    lines.push(`<g data-layer="perspective-grid">`);
    for (const seg of grid.radialLines) {
      lines.push(
        `<line x1="${fmt(seg.start.xPx)}" y1="${fmt(seg.start.yPx)}" x2="${fmt(seg.end.xPx)}" y2="${fmt(seg.end.yPx)}" stroke="${palette.gridLine}" stroke-width="1.00" />`,
      );
    }
    for (const seg of grid.depthLines) {
      lines.push(
        `<line x1="${fmt(seg.start.xPx)}" y1="${fmt(seg.start.yPx)}" x2="${fmt(seg.end.xPx)}" y2="${fmt(seg.end.yPx)}" stroke="${palette.gridLine}" stroke-width="0.90" />`,
      );
    }
    lines.push(`</g>`);
  }

  lines.push(
    `<g data-layer="horizon-eye-level">`,
    `<line x1="0" y1="${fmt(horizonY)}" x2="${fmt(W)}" y2="${fmt(horizonY)}" stroke="${palette.horizonStroke}" stroke-width="1.60" stroke-dasharray="8 5" />`,
    `<circle cx="${fmt(principalX)}" cy="${fmt(horizonY)}" r="4.50" fill="${palette.badgeBg}" stroke="${palette.horizonStroke}" stroke-width="1.80" />`,
    `<text x="${fmt(W - 14)}" y="${fmt(Math.max(16, horizonY - 8))}" text-anchor="end" font-family="sans-serif" font-size="11" fill="${palette.horizonStroke}">지평선 눈높이 ${fmt(stage.cameraEyeHeightMeters)}m (Y=${fmt(horizonY, 0)}px)</text>`,
    `</g>`,
    `<g data-layer="crowd-and-foliage-silhouettes">`,
  );

  const showEyeTicks = options?.showEyeLevelTicks ?? true;
  for (const entity of entities) {
    const bodySvg =
      entity.category === "foliage"
        ? renderFoliageSilhouette(entity, theme, palette)
        : entity.category === "prop"
          ? renderStreetLampSilhouette(entity, theme, palette)
          : renderHumanSilhouette(entity, theme, palette, showEyeTicks);
    lines.push(
      `<g data-entity-id="${escapeXmlText(entity.id)}" data-painter-order="${entity.painterOrderIndex}" data-depth-m="${fmt(entity.depthMeters)}" data-tier="${entity.atmosphericStyle.detailTier}">${bodySvg}</g>`,
    );
  }
  lines.push(`</g>`);

  if ((options?.showKeepOutZones ?? true) && keepOutZones.length > 0) {
    lines.push(`<g data-layer="keep-out-zones">`);
    for (const zone of keepOutZones) {
      const style = palette.keepOut[zone.role];
      const zw = Math.max(0, zone.bbox.maxXPx - zone.bbox.minXPx);
      const zh = Math.max(0, zone.bbox.maxYPx - zone.bbox.minYPx);
      const label = `${KEEP_OUT_ROLE_LABELS_KO[zone.role]} (${escapeXmlText(zone.id)})`;
      lines.push(
        `<rect x="${fmt(zone.bbox.minXPx)}" y="${fmt(zone.bbox.minYPx)}" width="${fmt(zw)}" height="${fmt(zh)}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.60" stroke-dasharray="6 4" rx="6" />`,
        `<text x="${fmt(zone.bbox.minXPx + 8)}" y="${fmt(zone.bbox.minYPx + 16)}" font-family="sans-serif" font-size="11" font-weight="600" fill="${style.stroke}">${label}</text>`,
      );
    }
    lines.push(`</g>`);
  }

  lines.push(
    `<g data-layer="stage-hud-header">`,
    `<rect x="14" y="14" width="${fmt(Math.min(460, W - 28))}" height="46" rx="8" fill="${palette.badgeBg}" stroke="${palette.badgeBorder}" stroke-width="1.10" />`,
    `<text x="26" y="33" font-family="sans-serif" font-size="13" font-weight="700" fill="${palette.textPrimary}">${titleText}</text>`,
    `<text x="26" y="50" font-family="sans-serif" font-size="11" fill="${palette.textMuted}">배치 ${metrics.placedCount}/${metrics.requestedCount} · 보호구역 침범 ${metrics.keepOutViolationCount} · 복제 충돌 ${metrics.adjacentCloneConflictCount} · 다양성 ${fmt(metrics.diversityEntropy01 * 100, 1)}%</text>`,
    `</g>`,
    `<rect x="0.50" y="0.50" width="${fmt(W - 1)}" height="${fmt(H - 1)}" fill="none" stroke="${palette.frameStroke}" stroke-width="1.00" />`,
    `</svg>`,
  );
  return lines.join("\n");
}

/**
 * 웹툰 배경 감독 관점의 자연스러운 한국어 배치 감사 리포트를 생성한다.
 */
export function summarizeCrowdScatterKo(scatterResult: CrowdScatterResult): CrowdScatterAuditKo {
  const { stage, metrics, nearDepthMeters, farDepthMeters } = scatterResult;
  const warningsKo: string[] = [];

  if (metrics.worldCollisionCount > 0) {
    warningsKo.push(
      `월드 지면 발자국 겹침이 ${metrics.worldCollisionCount}건 발생했습니다. 간격 배수(spacingMultiplier)를 높여 다시 배치하세요.`,
    );
  }
  if (metrics.keepOutViolationCount > 0) {
    warningsKo.push(
      `주인공·말풍선 보호구역 침범이 ${metrics.keepOutViolationCount}건 감지되었습니다. 보호구역 경계를 재확인하세요.`,
    );
  }
  if (metrics.adjacentCloneConflictCount > 0) {
    warningsKo.push(
      `최근접 이웃과 같은 실루엣 조합이 ${metrics.adjacentCloneConflictCount}건 남아 있습니다. 포즈 변형이나 아키타입을 늘려 주세요.`,
    );
  }
  if (metrics.requestedCount > 0 && metrics.placedCount < metrics.requestedCount) {
    warningsKo.push(
      `요청 수량 ${metrics.requestedCount}개체 중 ${metrics.placedCount}개체만 배치되었습니다(보호구역 회피 ${metrics.rejectedKeepOutCount}회, 공간 충돌 회피 ${metrics.rejectedCollisionCount}회).`,
    );
  }

  const hasFailure =
    metrics.worldCollisionCount > 0 ||
    metrics.keepOutViolationCount > 0 ||
    !metrics.isDepthSortedBackToFront;
  const statusBadgeKo: "통과" | "주의" | "실패" = hasFailure
    ? "실패"
    : warningsKo.length > 0
      ? "주의"
      : "통과";

  const diversityPct = (metrics.diversityEntropy01 * 100).toFixed(1);
  const eyeErrText = metrics.maxCanonicalHorizonEyeErrorPx.toExponential(2);
  const headlineKo =
    statusBadgeKo === "실패"
      ? `원근 배치 무결성 오류 — 충돌 ${metrics.worldCollisionCount}건 · 보호구역 침범 ${metrics.keepOutViolationCount}건`
      : `원근 지평선 잠금 배치 ${statusBadgeKo} — 총 ${metrics.placedCount}개체 (충돌 0건 · 보호구역 침범 0건)`;

  const summaryParagraphKo =
    metrics.placedCount === 0
      ? `지평선 Y=${Math.round(stage.horizonYPx)}px(눈높이 ${stage.cameraEyeHeightMeters.toFixed(2)}m) 스테이지에서 배치된 개체가 없습니다. 보호구역 범위와 가용 지면 폭을 확인하세요.`
      : `지평선 Y=${Math.round(stage.horizonYPx)}px(카메라 눈높이 ${stage.cameraEyeHeightMeters.toFixed(2)}m, 깊이 ${nearDepthMeters.toFixed(1)}m~${farDepthMeters.toFixed(1)}m) 기준으로 총 ${metrics.placedCount}개체를 근경 ${metrics.tierCounts["detailed-foreground"]} · 중경 ${metrics.tierCounts["midground-contour"]} · 원경 ${metrics.tierCounts["soft-background-wash"]}개체로 배치했습니다. 기준 눈높이 정렬 오차는 ${eyeErrText}px 이하이며, 주인공·말풍선 보호구역 침범과 지면 발자국 겹침 없이 원경에서 근경 순서로 정렬했습니다.`;

  return {
    statusBadgeKo,
    headlineKo,
    summaryParagraphKo,
    bulletLinesKo: [
      `깊이 계층 분포: 근경 ${metrics.tierCounts["detailed-foreground"]}개체 · 중경 ${metrics.tierCounts["midground-contour"]}개체 · 원경 ${metrics.tierCounts["soft-background-wash"]}개체 (인물 ${metrics.categoryCounts.human} · 식생 ${metrics.categoryCounts.foliage} · 소품 ${metrics.categoryCounts.prop})`,
      `지평선 눈높이 정확도: 기준 눈높이 최대 오차 ${eyeErrText}px, 실제 신장 편차 최대 ${metrics.maxHorizonEyeErrorPx.toFixed(2)}px`,
      `보호구역 청결도: 설정 구역 ${scatterResult.keepOutZones.length}곳 침범 ${metrics.keepOutViolationCount}건 (배치 중 보호구역 회피 ${metrics.rejectedKeepOutCount}회)`,
      `발자국 비충돌 검증: 월드 공간 겹침 ${metrics.worldCollisionCount}건, 원근 압축 배율 ${metrics.horizonCompressionFactor.toFixed(2)}배`,
      `복제 방지 다양성: 인접 복제 충돌 ${metrics.adjacentCloneConflictCount}건, 정규화 다양성 엔트로피 ${diversityPct}% (사용 변형 ${metrics.uniqueVariantCount}/${metrics.availableVariantCount}종)`,
      `합성 깊이 정렬: ${metrics.isDepthSortedBackToFront ? "원경→근경 역순 정렬 통과" : "깊이 정렬 불일치 감지"}`,
    ],
    warningsKo,
  };
}
