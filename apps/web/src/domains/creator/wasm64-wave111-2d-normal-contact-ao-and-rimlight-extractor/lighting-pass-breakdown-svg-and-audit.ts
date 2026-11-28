/**
 * Wave 111 — 2D 실루엣 법선·접촉 AO·림라이트 4패널 스튜디오 분해도 SVG 렌더러
 * (인쇄 안전 고대비 OKLCH 전용, 원시 hex/rgb 금지) 및 자연스러운 한국어 조명 QA 리포터.
 */

import type { CelContactAoRimPassResult } from "./contact-ao-cel-rim-compositor-and-wgsl";
import type { NormalInflationProfile } from "./silhouette-sdf-normal-inflator";

/** 인쇄·고대비 Calm Atelier OKLCH 팔레트 (원시 hex/rgb 전면 금지). */
const STUDIO_OKLCH = {
  paperBg: "oklch(0.985 0.008 90)",
  panelBg: "oklch(0.955 0.010 90)",
  canvasVoid: "oklch(0.925 0.012 92)",
  frameBorder: "oklch(0.81 0.016 90)",
  inkPrimary: "oklch(0.20 0.020 245)",
  inkSecondary: "oklch(0.42 0.020 245)",
  gridLine: "oklch(0.87 0.012 90)",
  forestAccent: "oklch(0.34 0.075 158)",
  keyLightArrow: "oklch(0.60 0.16 74)",
  rimLightArrow: "oklch(0.54 0.14 232)",
  barTrack: "oklch(0.89 0.012 90)",
  celLitBar: "oklch(0.68 0.13 78)",
  celShadowBar: "oklch(0.40 0.07 258)",
  aoGoodBar: "oklch(0.44 0.09 158)",
  rimPeakBar: "oklch(0.64 0.15 70)",
  badgeBgOk: "oklch(0.91 0.045 158)",
  badgeInkOk: "oklch(0.28 0.075 158)",
  badgeBgWarn: "oklch(0.92 0.065 72)",
  badgeInkWarn: "oklch(0.36 0.11 52)",
} as const;

/** 4패널 조명 분해도 SVG 렌더링 옵션. */
export interface LightingBreakdownSvgOptions {
  /** 도판 상단 제목(기본값 `"2D 실루엣 법선·접촉 AO·림라이트 4패널 분해도"`). */
  readonly sceneTitle?: string;
  /** 전체 SVG 폭(px, 기본값 `940`). */
  readonly widthPx?: number;
  /** 전체 SVG 높이(px, 기본값 `420`). */
  readonly heightPx?: number;
  /** 패널당 샘플링 격자 최대 해상도(기본값 `24`, 범위 `[8, 32]`). */
  readonly previewGridMax?: number;
}

/** 자연스러운 한국어 조명 디렉터 QA 요약 결과. */
export interface NormalAoRimQaSummaryKo {
  readonly verdict: "ready" | "needs-review" | "empty-mask";
  readonly profileLabelKo: string;
  readonly headlineKo: string;
  readonly bulletsKo: readonly string[];
  readonly reportTextKo: string;
  readonly maskCoveragePercent: number;
  readonly interiorPixelCount: number;
  readonly unitNormalMaxError: number;
  readonly unitNormalValid: boolean;
  readonly celLitRatioPercent: number;
  readonly celShadowRatioPercent: number;
  readonly meanInteriorAo: number;
  readonly minInteriorAo: number;
  readonly contactAoDarkenedRatioPercent: number;
  readonly rimPeakIntensity: number;
  readonly rimLitPixelCount: number;
  readonly outsideMaskLeakPixels: number;
}

/** XML 특수문자를 안전하게 이스케이프한다. */
export function escapeLightingSvgXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeSvgNum(value: number, fallback: number = 0, digits: number = 2): string {
  const safe = Number.isFinite(value) ? value : fallback;
  const normalized = Object.is(safe, -0) || safe === 0 ? 0 : safe;
  return normalized.toFixed(digits);
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function profileLabelKo(profile: NormalInflationProfile): string {
  if (profile === "soft-organic") return "부드러운 유기체 돔";
  if (profile === "cel-bevel") return "셀 베벨 챔퍼";
  return "각진 하드서피스 베벨";
}

function normalToOklch(nx: number, ny: number, nz: number): string {
  const safeNx = Number.isFinite(nx) ? nx : 0;
  const safeNy = Number.isFinite(ny) ? ny : 0;
  const safeNz = clampUnit(nz);
  const radial = Math.min(1, Math.hypot(safeNx, safeNy));
  const hue = (((Math.atan2(safeNy, safeNx) * 180) / Math.PI) + 360) % 360;
  const lightness = 0.36 + 0.48 * safeNz;
  const chroma = 0.025 + 0.165 * radial;
  return `oklch(${safeSvgNum(lightness, 0.6, 3)} ${safeSvgNum(chroma, 0.05, 3)} ${safeSvgNum(hue, 220, 1)})`;
}

function celToOklch(cel: number): string {
  const v = clampUnit(cel);
  const lightness = 0.28 + 0.64 * v;
  const chroma = v >= 0.5 ? 0.045 + 0.045 * v : 0.055;
  const hue = v >= 0.5 ? 76 : 256;
  return `oklch(${safeSvgNum(lightness, 0.5, 3)} ${safeSvgNum(chroma, 0.05, 3)} ${safeSvgNum(hue, 250, 1)})`;
}

function aoToOklch(ao: number): string {
  const v = clampUnit(ao);
  const lightness = 0.22 + 0.72 * v;
  return `oklch(${safeSvgNum(lightness, 0.8, 3)} 0.016 245)`;
}

function compositePixelToOklch(
  r: number,
  g: number,
  b: number,
  cel: number,
  rim: number,
): string {
  const lum = clampUnit((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
  const safeRim = clampUnit(rim);
  const safeCel = clampUnit(cel);
  const lightness = Math.max(0.2, Math.min(0.97, 0.24 + 0.66 * lum + 0.09 * safeRim));
  const chroma = Math.max(0.025, Math.min(0.2, 0.04 + 0.12 * safeRim + 0.03 * (1 - safeCel)));
  const hue = safeRim >= 0.22 ? 78 : safeCel >= 0.5 ? 56 : 258;
  return `oklch(${safeSvgNum(lightness, 0.6, 3)} ${safeSvgNum(chroma, 0.05, 3)} ${safeSvgNum(hue, 60, 1)})`;
}

type BreakdownPanelKind = "normal" | "cel" | "ao" | "final";

function renderSampledRasterPanel(
  passResult: CelContactAoRimPassResult,
  panelKind: BreakdownPanelKind,
  boxX: number,
  boxY: number,
  boxSize: number,
  gridMax: number,
): string {
  const { width, height, normalField, celShadeBuffer, contactAoBuffer, rimBuffer, compositeRgba } =
    passResult;
  const cols = Math.max(1, Math.min(width, gridMax));
  const rows = Math.max(1, Math.min(height, gridMax));
  const cellW = boxSize / cols;
  const cellH = boxSize / rows;
  const parts: string[] = [];

  parts.push(
    `<rect x="${safeSvgNum(boxX)}" y="${safeSvgNum(boxY)}" width="${safeSvgNum(boxSize)}" height="${safeSvgNum(boxSize)}" rx="6" fill="${STUDIO_OKLCH.canvasVoid}" stroke="${STUDIO_OKLCH.frameBorder}" stroke-width="1" />`,
  );

  for (let gy = 0; gy < rows; gy += 1) {
    const sy = Math.min(height - 1, Math.floor(((gy + 0.5) * height) / rows));
    for (let gx = 0; gx < cols; gx += 1) {
      const sx = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / cols));
      const idx = sy * width + sx;
      if (normalField.binaryMask[idx] === 0) continue;

      let fill: string;
      if (panelKind === "normal") {
        const nIdx = idx * 3;
        fill = normalToOklch(
          normalField.normals[nIdx] ?? 0,
          normalField.normals[nIdx + 1] ?? 0,
          normalField.normals[nIdx + 2] ?? 1,
        );
      } else if (panelKind === "cel") {
        fill = celToOklch(celShadeBuffer[idx] ?? 0);
      } else if (panelKind === "ao") {
        fill = aoToOklch(contactAoBuffer[idx] ?? 1);
      } else {
        const rgbaIdx = idx * 4;
        fill = compositePixelToOklch(
          compositeRgba[rgbaIdx] ?? 0,
          compositeRgba[rgbaIdx + 1] ?? 0,
          compositeRgba[rgbaIdx + 2] ?? 0,
          celShadeBuffer[idx] ?? 0,
          rimBuffer[idx] ?? 0,
        );
      }

      const rx = boxX + gx * cellW;
      const ry = boxY + gy * cellH;
      parts.push(
        `<rect x="${safeSvgNum(rx)}" y="${safeSvgNum(ry)}" width="${safeSvgNum(cellW + 0.35)}" height="${safeSvgNum(cellH + 0.35)}" fill="${fill}" />`,
      );
    }
  }

  return parts.join("");
}

/**
 * 4패널 조명 분해도 SVG(`Mask & Normal Sphere / Cel Shadow / Contact AO / Final Rim-Light Pass`)를
 * 인쇄 안전 고대비 OKLCH 토큰만으로 생성한다(원시 `#hex`/`rgb(` 전면 금지, NaN/Infinity 0건).
 */
export function renderLightingPassBreakdownSvg(
  passResult: CelContactAoRimPassResult,
  options?: LightingBreakdownSvgOptions,
): string {
  const width = Math.max(760, Math.round(options?.widthPx ?? 940));
  const height = Math.max(360, Math.round(options?.heightPx ?? 420));
  const gridMax = Math.max(8, Math.min(32, Math.round(options?.previewGridMax ?? 24)));

  const title = escapeLightingSvgXml(
    options?.sceneTitle ?? "2D 실루엣 법선·접촉 AO·림라이트 4패널 분해도",
  );
  const { telemetry, normalField, keyLightDir, rimLightDir, occluderLabelsKo } = passResult;
  const totalPixels = Math.max(1, passResult.width * passResult.height);
  const coveragePct = (telemetry.interiorPixelCount / totalPixels) * 100;
  const litPct =
    telemetry.interiorPixelCount > 0
      ? (telemetry.celLitPixelCount / telemetry.interiorPixelCount) * 100
      : 0;
  const occluderSummary =
    occluderLabelsKo.length > 0 ? occluderLabelsKo.join(", ") : "차폐 레이어 없음";

  const subtitle = escapeLightingSvgXml(
    `${profileLabelKo(normalField.profile)} · ${passResult.width}×${passResult.height}px · 마스크 ${safeSvgNum(coveragePct, 0, 1)}% · ${passResult.bandCount}단 셀 · ${occluderSummary}`,
  );

  const marginX = 24;
  const gapX = 16;
  const panelW = (width - marginX * 2 - gapX * 3) / 4;
  const panelY = 74;
  const panelH = height - 122;
  const rasterSize = Math.min(panelW - 24, panelH - 86);

  const panels: ReadonlyArray<{
    readonly kind: BreakdownPanelKind;
    readonly heading: string;
    readonly caption: string;
    readonly barRatio: number;
    readonly barColor: string;
  }> = [
    {
      kind: "normal",
      heading: "Mask & Normal Sphere",
      caption: `|n| 오차 ${safeSvgNum(normalField.maxNormalLengthError, 0, 6)} · min nz ${safeSvgNum(normalField.minInteriorNz, 1, 2)}`,
      barRatio: clampUnit(1 - normalField.maxNormalLengthError * 1000),
      barColor: STUDIO_OKLCH.forestAccent,
    },
    {
      kind: "cel",
      heading: "Cel Shadow",
      caption: `명부 ${safeSvgNum(litPct, 0, 1)}% · 암부 ${safeSvgNum(100 - litPct, 0, 1)}%`,
      barRatio: clampUnit(litPct / 100),
      barColor: STUDIO_OKLCH.celLitBar,
    },
    {
      kind: "ao",
      heading: "Contact AO",
      caption: `평균 AO ${safeSvgNum(telemetry.meanInteriorAo, 1, 3)} · 최저 ${safeSvgNum(telemetry.minInteriorAo, 1, 3)}`,
      barRatio: clampUnit(telemetry.meanInteriorAo),
      barColor: STUDIO_OKLCH.aoGoodBar,
    },
    {
      kind: "final",
      heading: "Final Rim-Light Pass",
      caption: `림 최대 ${safeSvgNum(telemetry.rimPeakIntensity, 0, 3)} · 외곽 번짐 ${telemetry.outsideMaskLeakPixels}px`,
      barRatio: clampUnit(telemetry.rimPeakIntensity),
      barColor: STUDIO_OKLCH.rimPeakBar,
    },
  ];

  const panelMarkup: string[] = [];
  for (let i = 0; i < panels.length; i += 1) {
    const p = panels[i];
    if (!p) continue;
    const px = marginX + i * (panelW + gapX);
    const rasterX = px + (panelW - rasterSize) * 0.5;
    const rasterY = panelY + 34;
    const barY = rasterY + rasterSize + 18;
    const barW = panelW - 24;

    panelMarkup.push(
      `<g data-panel="${p.kind}">` +
        `<rect x="${safeSvgNum(px)}" y="${safeSvgNum(panelY)}" width="${safeSvgNum(panelW)}" height="${safeSvgNum(panelH)}" rx="10" fill="${STUDIO_OKLCH.panelBg}" stroke="${STUDIO_OKLCH.frameBorder}" stroke-width="1.2" />` +
        `<text x="${safeSvgNum(px + 12)}" y="${safeSvgNum(panelY + 22)}" font-size="12.5" font-weight="700" fill="${STUDIO_OKLCH.inkPrimary}">${escapeLightingSvgXml(p.heading)}</text>` +
        renderSampledRasterPanel(passResult, p.kind, rasterX, rasterY, rasterSize, gridMax) +
        `<rect x="${safeSvgNum(px + 12)}" y="${safeSvgNum(barY)}" width="${safeSvgNum(barW)}" height="6" rx="3" fill="${STUDIO_OKLCH.barTrack}" />` +
        `<rect x="${safeSvgNum(px + 12)}" y="${safeSvgNum(barY)}" width="${safeSvgNum(barW * p.barRatio)}" height="6" rx="3" fill="${p.barColor}" />` +
        `<text x="${safeSvgNum(px + 12)}" y="${safeSvgNum(barY + 22)}" font-size="10.5" fill="${STUDIO_OKLCH.inkSecondary}">${escapeLightingSvgXml(p.caption)}</text>` +
        `</g>`,
    );
  }

  // 첫 패널 우측 상단에 키 라이트·림라이트 방향 미니 인디케이터(Normal Sphere compass) 오버레이
  const compassCx = marginX + panelW - 28;
  const compassCy = panelY + 56;
  const compassR = 14;
  const keyEndX = compassCx + keyLightDir[0] * compassR;
  const keyEndY = compassCy + keyLightDir[1] * compassR;
  const rimEndX = compassCx + rimLightDir[0] * compassR;
  const rimEndY = compassCy + rimLightDir[1] * compassR;

  const badgeOk =
    telemetry.outsideMaskLeakPixels === 0 &&
    telemetry.nanCount === 0 &&
    normalField.maxNormalLengthError < 1e-5;
  const badgeFill = badgeOk ? STUDIO_OKLCH.badgeBgOk : STUDIO_OKLCH.badgeBgWarn;
  const badgeInk = badgeOk ? STUDIO_OKLCH.badgeInkOk : STUDIO_OKLCH.badgeInkWarn;
  const badgeLabel = badgeOk ? "무누수·단위법선 검증 통과" : "조명 패스 점검 필요";

  const footerText = escapeLightingSvgXml(
    `Key (${safeSvgNum(keyLightDir[0], 0, 2)}, ${safeSvgNum(keyLightDir[1], 0, 2)}, ${safeSvgNum(keyLightDir[2], 1, 2)}) · Rim (${safeSvgNum(rimLightDir[0], 0, 2)}, ${safeSvgNum(rimLightDir[1], 0, 2)}, ${safeSvgNum(rimLightDir[2], 1, 2)}) · 수치 이상 ${telemetry.nanCount}건`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="${STUDIO_OKLCH.paperBg}" stroke="${STUDIO_OKLCH.frameBorder}" stroke-width="1.5" />`,
    `<text x="${marginX}" y="34" font-size="17" font-weight="700" fill="${STUDIO_OKLCH.inkPrimary}">${title}</text>`,
    `<text x="${marginX}" y="54" font-size="11.5" fill="${STUDIO_OKLCH.inkSecondary}">${subtitle}</text>`,
    `<rect x="${width - 210}" y="18" width="186" height="28" rx="14" fill="${badgeFill}" />`,
    `<text x="${width - 117}" y="36" text-anchor="middle" font-size="11.5" font-weight="700" fill="${badgeInk}">${escapeLightingSvgXml(badgeLabel)}</text>`,
    panelMarkup.join(""),
    `<g data-light-compass="true">`,
    `<circle cx="${safeSvgNum(compassCx)}" cy="${safeSvgNum(compassCy)}" r="${compassR}" fill="${STUDIO_OKLCH.paperBg}" stroke="${STUDIO_OKLCH.frameBorder}" stroke-width="1" />`,
    `<line x1="${safeSvgNum(compassCx)}" y1="${safeSvgNum(compassCy)}" x2="${safeSvgNum(keyEndX)}" y2="${safeSvgNum(keyEndY)}" stroke="${STUDIO_OKLCH.keyLightArrow}" stroke-width="2" stroke-linecap="round" />`,
    `<line x1="${safeSvgNum(compassCx)}" y1="${safeSvgNum(compassCy)}" x2="${safeSvgNum(rimEndX)}" y2="${safeSvgNum(rimEndY)}" stroke="${STUDIO_OKLCH.rimLightArrow}" stroke-width="1.8" stroke-linecap="round" />`,
    `<circle cx="${safeSvgNum(compassCx)}" cy="${safeSvgNum(compassCy)}" r="2" fill="${STUDIO_OKLCH.inkPrimary}" />`,
    `</g>`,
    `<line x1="${marginX}" y1="${height - 34}" x2="${width - marginX}" y2="${height - 34}" stroke="${STUDIO_OKLCH.gridLine}" stroke-width="1" />`,
    `<text x="${marginX}" y="${height - 15}" font-size="10.5" fill="${STUDIO_OKLCH.inkSecondary}">${footerText}</text>`,
    `</svg>`,
  ].join("");
}

/**
 * 2D 실루엣 법선·셀 음영·접촉 AO·림라이트 패스 결과를
 * 조명 디렉터용 자연스러운 한국어 QA 보고서로 요약한다.
 */
export function summarizeNormalAoRimPassKo(
  passResult: CelContactAoRimPassResult,
): NormalAoRimQaSummaryKo {
  const { telemetry, normalField, bandCount, occluderLabelsKo } = passResult;
  const totalPixels = Math.max(1, passResult.width * passResult.height);
  const maskCoveragePercent = (telemetry.interiorPixelCount / totalPixels) * 100;
  const profileKo = profileLabelKo(normalField.profile);

  const unitNormalValid =
    normalField.maxNormalLengthError < 1e-5 && normalField.minInteriorNz >= 0;

  if (telemetry.interiorPixelCount === 0) {
    const headlineKo = "실루엣 마스크 내부 픽셀이 비어 있어 조명 패스를 추출하지 않았습니다.";
    const bulletsKo = [
      `입력 해상도 ${passResult.width}×${passResult.height}px에서 유효 내부 픽셀이 0px입니다.`,
      `모든 외곽 픽셀은 중립 법선 (0, 0, 1)과 투명 알파 0으로 유지했으며 번짐은 0px입니다.`,
      `알파 임계값(현재 ${normalField.effectiveAlphaThreshold})이나 마스크 입력 레이어를 확인하세요.`,
    ];
    return {
      verdict: "empty-mask",
      profileLabelKo: profileKo,
      headlineKo,
      bulletsKo,
      reportTextKo: `${headlineKo}\n- ${bulletsKo.join("\n- ")}`,
      maskCoveragePercent: 0,
      interiorPixelCount: 0,
      unitNormalMaxError: 0,
      unitNormalValid: true,
      celLitRatioPercent: 0,
      celShadowRatioPercent: 0,
      meanInteriorAo: 1,
      minInteriorAo: 1,
      contactAoDarkenedRatioPercent: 0,
      rimPeakIntensity: 0,
      rimLitPixelCount: 0,
      outsideMaskLeakPixels: telemetry.outsideMaskLeakPixels,
    };
  }

  const celLitRatioPercent = (telemetry.celLitPixelCount / telemetry.interiorPixelCount) * 100;
  const celShadowRatioPercent = 100 - celLitRatioPercent;
  const contactAoDarkenedRatioPercent =
    (telemetry.contactAoDarkenedPixelCount / telemetry.interiorPixelCount) * 100;

  const isHealthy =
    unitNormalValid && telemetry.outsideMaskLeakPixels === 0 && telemetry.nanCount === 0;
  const verdict = isHealthy ? "ready" : "needs-review";

  const headlineKo = isHealthy
    ? `실루엣 내부 ${telemetry.interiorPixelCount}px(${maskCoveragePercent.toFixed(1)}%)에 ${profileKo} 법선장을 팽창해 셀 음영·접촉 AO·림라이트 패스를 추출했습니다.`
    : `조명 패스 검증 중 수치 이상(법선 오차 ${normalField.maxNormalLengthError.toFixed(6)}, 외곽 번짐 ${telemetry.outsideMaskLeakPixels}px, NaN ${telemetry.nanCount}건)이 감지되었습니다.`;

  const occluderPhrase =
    telemetry.occluderLayerCount > 0
      ? `상위 차폐 레이어 ${telemetry.occluderLayerCount}개(${occluderLabelsKo.join(", ")}) 기준 접촉 AO 평균은 ${telemetry.meanInteriorAo.toFixed(3)}(최저 ${telemetry.minInteriorAo.toFixed(3)})이며, 어두워진 접촉 영역이 ${contactAoDarkenedRatioPercent.toFixed(1)}%입니다.`
      : `상위 차폐 레이어가 없어 접촉 AO 평균은 ${telemetry.meanInteriorAo.toFixed(3)}로 깨끗하게 유지되었습니다.`;

  const bulletsKo = [
    `단위 법선 최대 오차는 ${normalField.maxNormalLengthError.toFixed(6)}(최소 nz ${normalField.minInteriorNz.toFixed(3)})로 내부 전 픽셀의 방향 정합성이 유지됩니다.`,
    `${bandCount}단계 셀 명암 분포는 밝은 영역 ${celLitRatioPercent.toFixed(1)}%, 그림자 영역 ${celShadowRatioPercent.toFixed(1)}%입니다.`,
    occluderPhrase,
    `프레넬 림라이트 최대 강도는 ${telemetry.rimPeakIntensity.toFixed(3)}(활성 경계 ${telemetry.rimLitPixelCount}px)이며, 마스크 바깥 픽셀 번짐은 ${telemetry.outsideMaskLeakPixels}px입니다.`,
  ];

  return {
    verdict,
    profileLabelKo: profileKo,
    headlineKo,
    bulletsKo,
    reportTextKo: `${headlineKo}\n- ${bulletsKo.join("\n- ")}`,
    maskCoveragePercent,
    interiorPixelCount: telemetry.interiorPixelCount,
    unitNormalMaxError: normalField.maxNormalLengthError,
    unitNormalValid,
    celLitRatioPercent,
    celShadowRatioPercent,
    meanInteriorAo: telemetry.meanInteriorAo,
    minInteriorAo: telemetry.minInteriorAo,
    contactAoDarkenedRatioPercent,
    rimPeakIntensity: telemetry.rimPeakIntensity,
    rimLitPixelCount: telemetry.rimLitPixelCount,
    outsideMaskLeakPixels: telemetry.outsideMaskLeakPixels,
  };
}
