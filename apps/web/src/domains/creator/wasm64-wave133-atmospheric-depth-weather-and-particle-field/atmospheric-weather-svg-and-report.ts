/**
 * Wave 133 — 인쇄 안전 순수 OKLCH 3-심도 날씨 연출 검수 SVG 렌더러
 * (원시 hex/rgb/hsl 0건, XML 특수문자 이스케이프, NaN/Infinity 0건) 및
 * 자연스러운 한국어 웹툰 배경·이펙트 감독 QA 브리프 생성기.
 */

import {
  clampFinite,
  formatOklchCss,
  formatSafeDecimal,
  type AtmosphericWeatherFieldResult,
  type AtmosphericWeatherParticle,
  type DepthLayerId,
  type NormalizedKeepOutBox,
  type WeatherPresetId,
} from "./atmospheric-weather-types";

const SVG_TOKENS = {
  paperBg: "oklch(0.985 0.006 88)",
  cardBg: "oklch(0.962 0.008 90)",
  border: "oklch(0.835 0.014 88)",
  inkPrimary: "oklch(0.215 0.020 248)",
  inkSecondary: "oklch(0.425 0.016 248)",
  badgeBg: "oklch(0.938 0.020 156)",
  badgeInk: "oklch(0.290 0.068 156)",
  faceStroke: "oklch(0.560 0.165 24)",
  faceFill: "oklch(0.680 0.120 24 / 0.10)",
  balloonStroke: "oklch(0.490 0.140 250)",
  balloonFill: "oklch(0.680 0.095 250 / 0.10)",
  curveGrid: "oklch(0.870 0.010 90)",
  curveStroke: "oklch(0.440 0.135 162)",
  curveFill: "oklch(0.740 0.085 162 / 0.18)",
  focalMarker: "oklch(0.540 0.155 45)",
} as const;

export interface AtmosphericWeatherSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly customTitle?: string;
  readonly showKeepOutOverlay?: boolean;
  readonly showTransmittanceCurve?: boolean;
}

export interface AtmosphericWeatherDirectorBriefKo {
  readonly verdict: "ready" | "reduced-motion-ready" | "needs-review";
  readonly presetId: WeatherPresetId;
  readonly headlineKo: string;
  readonly bulletsKo: readonly string[];
  readonly reportTextKo: string;
  readonly activeParticleCount: number;
  readonly relocatedCount: number;
  readonly culledCount: number;
  readonly heroFaceAndBalloonOcclusionCount: number;
  readonly farFogBlendPercent: number;
  readonly weatherFieldSha256Hex: string;
}

/** XML 특수문자(`<`, `>`, `&`, `"`, `'`)를 안전하게 이스케이프한다. */
export function escapeWeatherSvgXml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function renderSingleParticleSvg(
  p: AtmosphericWeatherParticle,
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): string {
  const cx = offsetX + p.x * scaleX;
  const cy = offsetY + p.y * scaleY;
  const scaleMin = Math.min(scaleX, scaleY);
  const r = clampFinite(p.radiusPx * scaleMin, 0.8, 32, 3);
  const sx1 = offsetX + p.x1 * scaleX;
  const sy1 = offsetY + p.y1 * scaleY;
  const sx2 = offsetX + p.x2 * scaleX;
  const sy2 = offsetY + p.y2 * scaleY;

  if (p.shape === "rain-streak") {
    const sw = clampFinite(r * 0.72, 0.7, 5.5, 1.4);
    return `      <line x1="${formatSafeDecimal(sx1, 2)}" y1="${formatSafeDecimal(sy1, 2)}" x2="${formatSafeDecimal(sx2, 2)}" y2="${formatSafeDecimal(sy2, 2)}" stroke="${p.colorOklchCss}" stroke-width="${formatSafeDecimal(sw, 2)}" stroke-linecap="round" data-shape="rain-streak" data-layer="${p.layer}" />`;
  }

  if (p.shape === "petal") {
    const rx = r * 1.25;
    const ry = r * 0.68;
    const d = `M ${formatSafeDecimal(-rx, 2)} 0 Q 0 ${formatSafeDecimal(-ry * 1.4, 2)} ${formatSafeDecimal(rx, 2)} 0 Q 0 ${formatSafeDecimal(ry * 1.3, 2)} ${formatSafeDecimal(-rx, 2)} 0 Z`;
    return `      <path d="${d}" transform="translate(${formatSafeDecimal(cx, 2)} ${formatSafeDecimal(cy, 2)}) rotate(${formatSafeDecimal(p.tiltDeg, 1)})" fill="${p.colorOklchCss}" data-shape="petal" data-layer="${p.layer}" />`;
  }

  if (p.shape === "ember-spark") {
    const sw = clampFinite(r * 0.68, 0.8, 4.5, 1.5);
    return [
      `      <g data-shape="ember-spark" data-layer="${p.layer}">`,
      `        <line x1="${formatSafeDecimal(sx1, 2)}" y1="${formatSafeDecimal(sy1, 2)}" x2="${formatSafeDecimal(sx2, 2)}" y2="${formatSafeDecimal(sy2, 2)}" stroke="${p.colorOklchCss}" stroke-width="${formatSafeDecimal(sw, 2)}" stroke-linecap="round" />`,
      `        <circle cx="${formatSafeDecimal(sx2, 2)}" cy="${formatSafeDecimal(sy2, 2)}" r="${formatSafeDecimal(r * 0.65, 2)}" fill="${p.colorOklchCss}" />`,
      `      </g>`,
    ].join("\n");
  }

  if (p.shape === "dust-mote") {
    const haloR = clampFinite(r + p.bokehBlurPx * scaleMin * 0.35, r, 36, r * 1.3);
    return [
      `      <g data-shape="dust-mote" data-layer="${p.layer}">`,
      `        <circle cx="${formatSafeDecimal(cx, 2)}" cy="${formatSafeDecimal(cy, 2)}" r="${formatSafeDecimal(haloR, 2)}" fill="${p.colorOklchCss}" fill-opacity="0.32" />`,
      `        <circle cx="${formatSafeDecimal(cx, 2)}" cy="${formatSafeDecimal(cy, 2)}" r="${formatSafeDecimal(r * 0.7, 2)}" fill="${p.colorOklchCss}" />`,
      `      </g>`,
    ].join("\n");
  }

  // snowflake
  const coreR = clampFinite(r * 0.55, 0.6, 18, 1.8);
  return [
    `      <g data-shape="snowflake" data-layer="${p.layer}">`,
    `        <circle cx="${formatSafeDecimal(cx, 2)}" cy="${formatSafeDecimal(cy, 2)}" r="${formatSafeDecimal(r, 2)}" fill="${p.colorOklchCss}" fill-opacity="0.48" />`,
    `        <circle cx="${formatSafeDecimal(cx, 2)}" cy="${formatSafeDecimal(cy, 2)}" r="${formatSafeDecimal(coreR, 2)}" fill="${p.colorOklchCss}" />`,
    `      </g>`,
  ].join("\n");
}

function renderKeepOutBoxesSvg(
  boxes: readonly NormalizedKeepOutBox[],
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): string {
  if (boxes.length === 0) return "";
  return boxes
    .map((box) => {
      const bx = offsetX + box.x * scaleX;
      const by = offsetY + box.y * scaleY;
      const bw = Math.max(4, box.width * scaleX);
      const bh = Math.max(4, box.height * scaleY);
      const stroke = box.kind === "face" ? SVG_TOKENS.faceStroke : SVG_TOKENS.balloonStroke;
      const fill = box.kind === "face" ? SVG_TOKENS.faceFill : SVG_TOKENS.balloonFill;
      const labelEsc = escapeWeatherSvgXml(box.labelKo);
      const idEsc = escapeWeatherSvgXml(box.id);
      return [
        `      <g data-keepout="${box.kind}" data-box-id="${idEsc}">`,
        `        <rect x="${formatSafeDecimal(bx, 2)}" y="${formatSafeDecimal(by, 2)}" width="${formatSafeDecimal(bw, 2)}" height="${formatSafeDecimal(bh, 2)}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-dasharray="6 4" />`,
        `        <text x="${formatSafeDecimal(bx + 6, 2)}" y="${formatSafeDecimal(by + 15, 2)}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="10.5" font-weight="600" fill="${stroke}">${labelEsc}</text>`,
        `      </g>`,
      ].join("\n");
    })
    .join("\n");
}

function renderTransmittanceCurveSvg(
  field: AtmosphericWeatherFieldResult,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): string {
  const padL = 44;
  const padR = 16;
  const padT = 26;
  const padB = 26;
  const plotW = Math.max(80, panelW - padL - padR);
  const plotH = Math.max(50, panelH - padT - padB);
  const maxDepth = 20;

  const points: string[] = [];
  const areaPoints: string[] = [];
  for (const pt of field.transmittanceCurve) {
    const nx = clampFinite(pt.depthMeters / maxDepth, 0, 1, 0);
    const ny = clampFinite(pt.transmittance, 0, 1, 1);
    const px = panelX + padL + nx * plotW;
    const py = panelY + padT + (1 - ny) * plotH;
    const pair = `${formatSafeDecimal(px, 2)},${formatSafeDecimal(py, 2)}`;
    points.push(pair);
    areaPoints.push(pair);
  }
  const baseY = panelY + padT + plotH;
  const firstX = panelX + padL;
  const lastX = panelX + padL + plotW;
  const polygonPts = `${formatSafeDecimal(firstX, 2)},${formatSafeDecimal(baseY, 2)} ${areaPoints.join(" ")} ${formatSafeDecimal(lastX, 2)},${formatSafeDecimal(baseY, 2)}`;
  const focusX = panelX + padL + clampFinite(field.focalDepthMeters / maxDepth, 0, 1, 0.19) * plotW;

  const titleEsc = escapeWeatherSvgXml(
    `Beer-Lambert 대기 투과율 T(z) = exp(-${formatSafeDecimal(field.extinctionBeta, 3)} · max(0, z - ${formatSafeDecimal(field.focusStartMeters, 1)}m))`,
  );

  return [
    `  <g data-layer="beer-lambert-curve">`,
    `    <rect x="${formatSafeDecimal(panelX, 2)}" y="${formatSafeDecimal(panelY, 2)}" width="${formatSafeDecimal(panelW, 2)}" height="${formatSafeDecimal(panelH, 2)}" rx="8" fill="${SVG_TOKENS.cardBg}" stroke="${SVG_TOKENS.border}" stroke-width="1" />`,
    `    <text x="${formatSafeDecimal(panelX + 12, 2)}" y="${formatSafeDecimal(panelY + 17, 2)}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11" font-weight="600" fill="${SVG_TOKENS.inkPrimary}">${titleEsc}</text>`,
    `    <line x1="${formatSafeDecimal(firstX, 2)}" y1="${formatSafeDecimal(panelY + padT, 2)}" x2="${formatSafeDecimal(firstX, 2)}" y2="${formatSafeDecimal(baseY, 2)}" stroke="${SVG_TOKENS.curveGrid}" stroke-width="1" />`,
    `    <line x1="${formatSafeDecimal(firstX, 2)}" y1="${formatSafeDecimal(baseY, 2)}" x2="${formatSafeDecimal(lastX, 2)}" y2="${formatSafeDecimal(baseY, 2)}" stroke="${SVG_TOKENS.curveGrid}" stroke-width="1" />`,
    `    <line x1="${formatSafeDecimal(focusX, 2)}" y1="${formatSafeDecimal(panelY + padT, 2)}" x2="${formatSafeDecimal(focusX, 2)}" y2="${formatSafeDecimal(baseY, 2)}" stroke="${SVG_TOKENS.focalMarker}" stroke-width="1.2" stroke-dasharray="4 3" />`,
    `    <polygon points="${polygonPts}" fill="${SVG_TOKENS.curveFill}" />`,
    `    <polyline points="${points.join(" ")}" fill="none" stroke="${SVG_TOKENS.curveStroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`,
    `    <text x="${formatSafeDecimal(firstX - 6, 2)}" y="${formatSafeDecimal(panelY + padT + 4, 2)}" text-anchor="end" font-family="Pretendard, sans-serif" font-size="9.5" fill="${SVG_TOKENS.inkSecondary}">1.0</text>`,
    `    <text x="${formatSafeDecimal(firstX - 6, 2)}" y="${formatSafeDecimal(baseY, 2)}" text-anchor="end" font-family="Pretendard, sans-serif" font-size="9.5" fill="${SVG_TOKENS.inkSecondary}">0.0</text>`,
    `    <text x="${formatSafeDecimal(firstX, 2)}" y="${formatSafeDecimal(baseY + 14, 2)}" font-family="Pretendard, sans-serif" font-size="9.5" fill="${SVG_TOKENS.inkSecondary}">0m</text>`,
    `    <text x="${formatSafeDecimal(focusX, 2)}" y="${formatSafeDecimal(baseY + 14, 2)}" text-anchor="middle" font-family="Pretendard, sans-serif" font-size="9.5" fill="${SVG_TOKENS.focalMarker}">초점 ${formatSafeDecimal(field.focalDepthMeters, 1)}m</text>`,
    `    <text x="${formatSafeDecimal(lastX, 2)}" y="${formatSafeDecimal(baseY + 14, 2)}" text-anchor="end" font-family="Pretendard, sans-serif" font-size="9.5" fill="${SVG_TOKENS.inkSecondary}">20m</text>`,
    `  </g>`,
  ].join("\n");
}

/**
 * 3-심도 날씨 파티클장, 원경 Beer-Lambert 안개 밴드, 얼굴·말풍선 보호 영역 및
 * 투과율 곡선을 원시 hex/rgb/hsl 없이 순수 `oklch(...)` 검수 SVG로 렌더링한다.
 */
export function renderAtmosphericWeatherSvg(
  field: AtmosphericWeatherFieldResult,
  options?: AtmosphericWeatherSvgOptions,
): string {
  const showKeepOut = options?.showKeepOutOverlay ?? true;
  const showCurve = options?.showTransmittanceCurve ?? true;
  const headerH = 56;
  const curveH = showCurve ? 132 : 0;
  const footerH = 40;
  const padX = 16;

  const outW = Math.round(clampFinite(options?.widthPx ?? 640, 320, 2048, 640));
  const stageH = Math.round(
    clampFinite(
      (options?.heightPx ?? 760) - headerH - curveH - footerH - 24,
      180,
      2048,
      510,
    ),
  );
  const outH = headerH + stageH + curveH + footerH + 24;
  const stageX = padX;
  const stageY = headerH + 8;
  const stageW = Math.max(160, outW - padX * 2);
  const scaleX = stageW / Math.max(field.viewportWidthPx, 1);
  const scaleY = stageH / Math.max(field.viewportHeightPx, 1);

  const titleRaw = options?.customTitle ?? `${field.preset.labelKo} — 3-심도 대기 원근·무가림 날씨 검수`;
  const titleEsc = escapeWeatherSvgXml(titleRaw);
  const subtitleEsc = escapeWeatherSvgXml(
    `근경 ${field.layerMetrics.foreground.count} · 중경 ${field.layerMetrics.midground.count} · 원경 ${field.layerMetrics.background.count} · 얼굴/말풍선 침범 ${field.heroFaceAndBalloonOcclusionCount}건 · SHA ${field.weatherFieldSha256Hex.slice(0, 12)}`,
  );
  const modeLabel = field.prefersReducedMotion ? "정적 안전 모드(플리커 0Hz)" : `동적 연출(${formatSafeDecimal(field.animatedFlickerHz, 1)}Hz)`;
  const footerEsc = escapeWeatherSvgXml(
    `${modeLabel} · 우회 ${field.relocatedCount}개 · 제외 ${field.culledCount}개 · 바람 (${formatSafeDecimal(field.effectiveWindX, 0)}, ${formatSafeDecimal(field.effectiveWindY, 0)})px/s`,
  );

  const skyCss = formatOklchCss(field.preset.skyBackdropOklch);
  const bandHeight = stageH / Math.max(field.fogBands.length, 1);
  const fogBandRects = field.fogBands
    .map((band, index) => {
      const by = stageY + (field.fogBands.length - 1 - index) * bandHeight;
      return `      <rect x="${formatSafeDecimal(stageX, 2)}" y="${formatSafeDecimal(by, 2)}" width="${formatSafeDecimal(stageW, 2)}" height="${formatSafeDecimal(bandHeight + 0.5, 2)}" fill="${band.hazeOklchCss}" data-fog-depth-m="${formatSafeDecimal(band.depthMeters, 1)}" />`;
    })
    .join("\n");

  const renderOrder: readonly DepthLayerId[] = ["background", "midground", "foreground"];
  const layerGroups = renderOrder
    .map((layerId) => {
      const items = field.particles
        .filter((p) => p.layer === layerId)
        .map((p) => renderSingleParticleSvg(p, stageX, stageY, scaleX, scaleY))
        .join("\n");
      return [
        `    <g data-depth-layer="${layerId}">`,
        items,
        `    </g>`,
      ]
        .filter((line) => line.length > 0)
        .join("\n");
    })
    .join("\n");

  const keepOutBlock = showKeepOut
    ? [
        `    <g data-layer="keepout-protection-boxes">`,
        renderKeepOutBoxesSvg(field.faceKeepOutBoxes, stageX, stageY, scaleX, scaleY),
        renderKeepOutBoxesSvg(field.balloonKeepOutBoxes, stageX, stageY, scaleX, scaleY),
        `    </g>`,
      ]
        .filter((line) => line.length > 0)
        .join("\n")
    : "";

  const curveBlock = showCurve
    ? renderTransmittanceCurveSvg(field, padX, stageY + stageH + 10, stageW, curveH - 8)
    : "";

  const footerTop = outH - footerH;
  const clipId = `wave133-stage-${escapeWeatherSvgXml(field.presetId)}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outW} ${outH}" width="${outW}" height="${outH}" role="img" aria-label="${titleEsc}">`,
    `  <defs>`,
    `    <clipPath id="${clipId}"><rect x="${stageX}" y="${stageY}" width="${stageW}" height="${stageH}" rx="8" /></clipPath>`,
    `  </defs>`,
    `  <rect x="0" y="0" width="${outW}" height="${outH}" fill="${SVG_TOKENS.paperBg}" />`,
    `  <text x="${padX}" y="24" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="15" font-weight="700" fill="${SVG_TOKENS.inkPrimary}">${titleEsc}</text>`,
    `  <text x="${padX}" y="44" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11.5" fill="${SVG_TOKENS.inkSecondary}">${subtitleEsc}</text>`,
    `  <line x1="0" y1="${headerH}" x2="${outW}" y2="${headerH}" stroke="${SVG_TOKENS.border}" stroke-width="1" />`,
    `  <rect x="${stageX}" y="${stageY}" width="${stageW}" height="${stageH}" rx="8" fill="${skyCss}" stroke="${SVG_TOKENS.border}" stroke-width="1" />`,
    `  <g clip-path="url(#${clipId})">`,
    `    <g data-layer="beer-lambert-fog-bands">`,
    fogBandRects,
    `    </g>`,
    layerGroups,
    keepOutBlock,
    `  </g>`,
    curveBlock,
    `  <line x1="0" y1="${footerTop}" x2="${outW}" y2="${footerTop}" stroke="${SVG_TOKENS.border}" stroke-width="1" />`,
    `  <rect x="${padX}" y="${footerTop + 8}" width="74" height="24" rx="6" fill="${SVG_TOKENS.badgeBg}" />`,
    `  <text x="${padX + 37}" y="${footerTop + 24}" text-anchor="middle" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11" font-weight="600" fill="${SVG_TOKENS.badgeInk}">Wave 133</text>`,
    `  <text x="${padX + 86}" y="${footerTop + 24}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="11.5" fill="${SVG_TOKENS.inkSecondary}">${footerEsc}</text>`,
    `</svg>`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 3-심도 대기 원근·날씨 파티클 합성 결과를 바탕으로
 * 번역투 없는 자연스러운 한국어 웹툰 배경·이펙트 감독 QA 브리프를 작성한다.
 */
export function summarizeAtmosphericWeatherKo(
  field: AtmosphericWeatherFieldResult,
): AtmosphericWeatherDirectorBriefKo {
  const fg = field.layerMetrics.foreground;
  const mid = field.layerMetrics.midground;
  const bg = field.layerMetrics.background;
  const farSample = field.transmittanceCurve[field.transmittanceCurve.length - 1];
  const farFogBlendPercent = Number(((farSample?.fogBlend ?? 0) * 100).toFixed(1));
  const farTransPercent = Number(((farSample?.transmittance ?? 1) * 100).toFixed(1));

  const allInvariantsPass =
    field.invariants.transmittanceStrictlyMonotonic &&
    field.invariants.sizeHierarchyValid &&
    field.invariants.speedHierarchyValid &&
    field.invariants.midgroundSharpestBokeh &&
    field.invariants.zeroFaceAndBalloonOcclusion &&
    field.invariants.reducedMotionSafe;

  const verdict: AtmosphericWeatherDirectorBriefKo["verdict"] = !allInvariantsPass
    ? "needs-review"
    : field.prefersReducedMotion
      ? "reduced-motion-ready"
      : "ready";

  const headlineKo =
    verdict === "ready"
      ? `${field.preset.labelKo} 3-심도 대기·파티클 검수 통과 — 얼굴·말풍선 가림 0건 확정`
      : verdict === "reduced-motion-ready"
        ? `${field.preset.labelKo} 정적 안전 모드 검수 통과 — 플리커 0Hz·얼굴·말풍선 무가림 확정`
        : `${field.preset.labelKo} 날씨 연출 재점검 필요 — 심도·가림 불변식 확인 권장`;

  const windDirLabel =
    field.effectiveWindX > 8
      ? "왼쪽에서 오른쪽"
      : field.effectiveWindX < -8
        ? "오른쪽에서 왼쪽"
        : "수직 중심";

  const bulletsKo: string[] = [
    `대기 원근 안개: Beer-Lambert 감쇠 계수 ${formatSafeDecimal(field.extinctionBeta, 3)} 기준으로 20m 원경 투과율은 ${farTransPercent.toFixed(1)}%, 안개 혼합 비율은 ${farFogBlendPercent.toFixed(1)}%로 거리에 맞춰 고르게 짙어졌습니다.`,
    `3-심도 시차 비례: 평균 입자 크기는 근경 ${formatSafeDecimal(fg.meanRadiusPx, 2)}px → 중경 ${formatSafeDecimal(mid.meanRadiusPx, 2)}px → 원경 ${formatSafeDecimal(bg.meanRadiusPx, 2)}px 순으로 줄었고, 이동 속도는 근경 ${formatSafeDecimal(fg.meanSpeedPxPerSec, 1)}px/s에서 원경 ${formatSafeDecimal(bg.meanSpeedPxPerSec, 1)}px/s로 완만해졌습니다.`,
    `초점면 보케 선명도: 주인공 초점 거리(${formatSafeDecimal(field.focalDepthMeters, 1)}m)가 놓인 중경 평균 블러 ${formatSafeDecimal(mid.meanBokehBlurPx, 2)}px가 근경(${formatSafeDecimal(fg.meanBokehBlurPx, 2)}px)·원경(${formatSafeDecimal(bg.meanBokehBlurPx, 2)}px)보다 또렷합니다.`,
    `얼굴·말풍선 보호: 보호 영역 ${field.faceKeepOutBoxes.length + field.balloonKeepOutBoxes.length}곳과 겹친 입자 가운데 ${field.relocatedCount}개를 외곽으로 우회하고 ${field.culledCount}개를 덜어내 최종 침범 ${field.heroFaceAndBalloonOcclusionCount}건을 유지했습니다.`,
    field.prefersReducedMotion
      ? `모션 안전성: 동작 줄이기 모드가 켜져 애니메이션 플리커를 0Hz, 흔들림을 0px로 고정하고 바람(${windDirLabel}) 기울기만 정적 일러스트 구도로 남겼습니다.`
      : `기류 연출: ${windDirLabel} 바람(${formatSafeDecimal(field.effectiveWindX, 0)}px/s)과 지문 ${field.weatherFieldSha256Hex.slice(0, 12)} 기준으로 활성 입자 ${field.particles.length}개를 결정론적으로 배치했습니다.`,
  ];

  const reportTextKo = [headlineKo, ...bulletsKo.map((line) => `- ${line}`)].join("\n");

  return {
    verdict,
    presetId: field.presetId,
    headlineKo,
    bulletsKo,
    reportTextKo,
    activeParticleCount: field.particles.length,
    relocatedCount: field.relocatedCount,
    culledCount: field.culledCount,
    heroFaceAndBalloonOcclusionCount: field.heroFaceAndBalloonOcclusionCount,
    farFogBlendPercent,
    weatherFieldSha256Hex: field.weatherFieldSha256Hex,
  };
}
