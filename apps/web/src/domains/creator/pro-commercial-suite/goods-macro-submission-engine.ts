/**
 * Wave 39C — 엔진 5·6·7·8:
 * 5) 굿즈·인쇄 칼선(아크릴 스탠드 2mm 화이트+3mm 도련+키링 타공 / 포토카드 55×85mm 라운드) & CMYK TAC<=300% 프리플라이트
 * 6) 무드보드 레퍼런스 → 카메라 화각(mm)·콘트라스트·3D LUT 시드 추출기
 * 7) `.tsmacro` 액션 매크로 레코더 · 직렬화 · 무결성 검증 · 일괄 리플레이어
 * 8) 공모전·출판사(네이버·카카오·레진·단행본) 원클릭 투고 규격 검사 & 매니페스트 빌더
 */

import { linearRgbToOklchString, srgbByteToLinear } from "./relight-breakout-engine";
import { computeDeterministicDigest32 } from "./typography-handoff-engine";

const MM_PER_INCH = 25.4;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function mmToPrintPixels(mm: number, dpi = 300): number {
  return Math.max(1, Math.round((Math.max(0, mm) / MM_PER_INCH) * Math.max(72, dpi)));
}

// ============================================================================
// 엔진 5: 굿즈·인쇄 칼선 & CMYK 프리플라이트 (TAC <= 300%)
// ============================================================================

export type GoodsTemplateKind = "acrylic-stand" | "photocard";

export interface GoodsDieCutSpecInput {
  readonly kind: GoodsTemplateKind;
  readonly title: string;
  readonly dpi?: number;
  readonly artworkWidthMm?: number;
  readonly artworkHeightMm?: number;
  readonly whiteBorderMm?: number;
  readonly bleedMm?: number;
  readonly cornerRadiusMm?: number;
  readonly keyringHoleEnabled?: boolean;
  readonly keyringHoleDiameterMm?: number;
  readonly samplePixelsRgba: Uint8ClampedArray;
}

export interface CmykSamplePoint {
  readonly cPct: number;
  readonly mPct: number;
  readonly yPct: number;
  readonly kPct: number;
  readonly tacPct: number;
}

export interface CmykPreflightReport {
  readonly tacLimitPct: number;
  readonly sampledPixelCount: number;
  readonly maxTacPct: number;
  readonly avgTacPct: number;
  readonly overLimitPixelCount: number;
  readonly overLimitRatioPct: number;
  readonly passed: boolean;
  readonly worstSample: CmykSamplePoint;
  readonly recommendedFixKo: string;
  readonly recommendedFixEn: string;
}

export interface KeyringHoleSpec {
  readonly cxMm: number;
  readonly cyMm: number;
  readonly diameterMm: number;
}

export interface GoodsDieCutPackage {
  readonly kind: GoodsTemplateKind;
  readonly title: string;
  readonly dpi: number;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedWidthMm: number;
  readonly bleedHeightMm: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly whiteBorderMm: number;
  readonly bleedMm: number;
  readonly cornerRadiusMm: number;
  readonly keyringHole: KeyringHoleSpec | null;
  readonly dieCutSvgPath: string;
  readonly bleedSvgPath: string;
  readonly preflight: CmykPreflightReport;
  readonly warnings: readonly string[];
}

export const CMYK_TAC_LIMIT_PCT = 300;

/** sRGB 바이트를 상업 오프셋 인쇄(저-UCR 모델) CMYK 총잉크량(%)으로 변환한다. */
export function rgbBytesToPrintCmyk(r: number, g: number, b: number): CmykSamplePoint {
  const c0 = 1 - clamp(r, 0, 255) / 255;
  const m0 = 1 - clamp(g, 0, 255) / 255;
  const y0 = 1 - clamp(b, 0, 255) / 255;
  const k = clamp(Math.min(c0, m0, y0) * 0.92, 0, 1);
  const ucr = k * 0.22;
  const cPct = Number((clamp(c0 - ucr, 0, 1) * 100).toFixed(1));
  const mPct = Number((clamp(m0 - ucr, 0, 1) * 100).toFixed(1));
  const yPct = Number((clamp(y0 - ucr, 0, 1) * 100).toFixed(1));
  const kPct = Number((k * 100).toFixed(1));
  return { cPct, mPct, yPct, kPct, tacPct: Number((cPct + mPct + yPct + kPct).toFixed(1)) };
}

/** RGBA 픽셀 버퍼의 CMYK 총잉크량(TAC <= 300%)을 전수 검사한다. */
export function inspectCmykTacPreflight(
  samplePixelsRgba: Uint8ClampedArray,
  tacLimitPct = CMYK_TAC_LIMIT_PCT,
): CmykPreflightReport {
  const limit = Math.max(200, Math.min(400, tacLimitPct));
  const totalPixels = Math.floor(samplePixelsRgba.length / 4);
  let sampledPixelCount = 0;
  let tacSum = 0;
  let overLimitPixelCount = 0;
  let worstSample: CmykSamplePoint = { cPct: 0, mPct: 0, yPct: 0, kPct: 0, tacPct: 0 };

  for (let i = 0; i < totalPixels; i += 1) {
    const idx = i * 4;
    if ((samplePixelsRgba[idx + 3] ?? 0) < 16) continue;
    const sample = rgbBytesToPrintCmyk(samplePixelsRgba[idx] ?? 255, samplePixelsRgba[idx + 1] ?? 255, samplePixelsRgba[idx + 2] ?? 255);
    sampledPixelCount += 1;
    tacSum += sample.tacPct;
    if (sample.tacPct > worstSample.tacPct) worstSample = sample;
    if (sample.tacPct > limit) overLimitPixelCount += 1;
  }

  const denom = Math.max(1, sampledPixelCount);
  const passed = worstSample.tacPct <= limit;
  return {
    tacLimitPct: limit,
    sampledPixelCount,
    maxTacPct: worstSample.tacPct,
    avgTacPct: Number((tacSum / denom).toFixed(1)),
    overLimitPixelCount,
    overLimitRatioPct: Number(((overLimitPixelCount / denom) * 100).toFixed(2)),
    passed,
    worstSample,
    recommendedFixKo: passed
      ? `총잉크량 최대 ${worstSample.tacPct}%로 기준(${limit}%) 이내입니다. 인쇄 출고 가능합니다.`
      : `최대 총잉크량 ${worstSample.tacPct}%가 기준(${limit}%)을 초과했습니다. 리치블랙 영역에 GCR 강화를 적용하세요.`,
    recommendedFixEn: passed
      ? `Peak TAC ${worstSample.tacPct}% is within ${limit}% print ceiling.`
      : `Peak TAC ${worstSample.tacPct}% exceeds ${limit}%. Apply stronger GCR to deep shadows.`,
  };
}

function buildRoundedRectSvgPath(x: number, y: number, w: number, h: number, r: number): string {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  const rx = rad.toFixed(2);
  return `M${(x + rad).toFixed(2)} ${y.toFixed(2)} H${(x + w - rad).toFixed(2)} A${rx} ${rx} 0 0 1 ${(x + w).toFixed(2)} ${(y + rad).toFixed(2)} V${(y + h - rad).toFixed(2)} A${rx} ${rx} 0 0 1 ${(x + w - rad).toFixed(2)} ${(y + h).toFixed(2)} H${(x + rad).toFixed(2)} A${rx} ${rx} 0 0 1 ${x.toFixed(2)} ${(y + h - rad).toFixed(2)} V${(y + rad).toFixed(2)} A${rx} ${rx} 0 0 1 ${(x + rad).toFixed(2)} ${y.toFixed(2)}Z`;
}

function buildCircleSvgSubpath(cx: number, cy: number, radius: number): string {
  const r = Math.max(0.5, radius);
  return `M${(cx - r).toFixed(2)} ${cy.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(r * 2).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 -${(r * 2).toFixed(2)} 0Z`;
}

/** 아크릴 스탠드(2mm 화이트+3mm 도련+키링 타공) / 포토카드(55×85mm 라운드) 칼선 + CMYK 프리플라이트 패키지. */
export function buildGoodsDieCutPackage(input: GoodsDieCutSpecInput): GoodsDieCutPackage {
  const dpi = Math.max(150, Math.min(600, Math.round(input.dpi ?? 300)));
  const isPhotocard = input.kind === "photocard";
  const whiteBorderMm = isPhotocard ? 0 : clamp(input.whiteBorderMm ?? 2.0, 1.0, 6.0);
  const bleedMm = clamp(input.bleedMm ?? 3.0, 1.5, 6.0);
  const cornerRadiusMm = isPhotocard ? clamp(input.cornerRadiusMm ?? 3.0, 1.0, 8.0) : clamp(input.cornerRadiusMm ?? 4.0, 1.0, 10.0);

  const trimWidthMm = isPhotocard ? 55 : clamp(input.artworkWidthMm ?? 86, 30, 200) + whiteBorderMm * 2;
  const trimHeightMm = isPhotocard ? 85 : clamp(input.artworkHeightMm ?? 136, 40, 260) + whiteBorderMm * 2;
  const bleedWidthMm = Number((trimWidthMm + bleedMm * 2).toFixed(2));
  const bleedHeightMm = Number((trimHeightMm + bleedMm * 2).toFixed(2));

  const keyringEnabled = !isPhotocard && (input.keyringHoleEnabled ?? true);
  const keyringDiameter = clamp(input.keyringHoleDiameterMm ?? 3.5, 2.5, 6.0);
  const keyringHole: KeyringHoleSpec | null = keyringEnabled
    ? { cxMm: Number((bleedWidthMm / 2).toFixed(2)), cyMm: Number((bleedMm + whiteBorderMm + keyringDiameter / 2 + 2.0).toFixed(2)), diameterMm: keyringDiameter }
    : null;

  const baseDiePath = buildRoundedRectSvgPath(bleedMm, bleedMm, trimWidthMm, trimHeightMm, cornerRadiusMm);
  const dieCutSvgPath = keyringHole ? `${baseDiePath} ${buildCircleSvgSubpath(keyringHole.cxMm, keyringHole.cyMm, keyringHole.diameterMm / 2)}` : baseDiePath;
  const bleedSvgPath = buildRoundedRectSvgPath(0, 0, bleedWidthMm, bleedHeightMm, Math.max(1, cornerRadiusMm));
  const preflight = inspectCmykTacPreflight(input.samplePixelsRgba, CMYK_TAC_LIMIT_PCT);

  const warnings: string[] = [];
  if (!preflight.passed) warnings.push(preflight.recommendedFixKo);
  if (!isPhotocard && whiteBorderMm < 2.0) warnings.push("아크릴 스탠드 화이트 보더가 2.0mm 미만이면 재단 오차 시 인쇄면이 잘릴 수 있습니다.");
  if (bleedMm < 3.0) warnings.push("인쇄 도련(bleed)은 3.0mm 이상을 권장합니다.");

  return {
    kind: input.kind,
    title: input.title.trim() || (isPhotocard ? "웹툰 한정 포토카드" : "웹툰 아크릴 스탠드"),
    dpi,
    trimWidthMm: Number(trimWidthMm.toFixed(2)),
    trimHeightMm: Number(trimHeightMm.toFixed(2)),
    bleedWidthMm,
    bleedHeightMm,
    canvasWidthPx: mmToPrintPixels(bleedWidthMm, dpi),
    canvasHeightPx: mmToPrintPixels(bleedHeightMm, dpi),
    whiteBorderMm: Number(whiteBorderMm.toFixed(2)),
    bleedMm: Number(bleedMm.toFixed(2)),
    cornerRadiusMm: Number(cornerRadiusMm.toFixed(2)),
    keyringHole,
    dieCutSvgPath,
    bleedSvgPath,
    preflight,
    warnings,
  };
}

/** CMYK 프리플라이트 데모·테스트용 RGBA 샘플 버퍼를 생성한다. */
export function createGoodsInkSampleBuffer(mode: "safe" | "heavy-black", pixelCount = 64): Uint8ClampedArray {
  const count = Math.max(4, Math.floor(pixelCount));
  const buf = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i += 1) {
    const idx = i * 4;
    if (mode === "heavy-black" && i % 4 === 0) {
      buf[idx] = 4;
      buf[idx + 1] = 3;
      buf[idx + 2] = 6;
    } else {
      buf[idx] = 78 + ((i * 23) % 150);
      buf[idx + 1] = 88 + ((i * 17) % 130);
      buf[idx + 2] = 104 + ((i * 19) % 120);
    }
    buf[idx + 3] = 255;
  }
  return buf;
}

// ============================================================================
// 엔진 6: 무드보드 레퍼런스 → 카메라 화각 / 3D LUT 시드 추출기
// ============================================================================

export type MoodboardGenreHint = "action" | "romance" | "thriller" | "slice-of-life" | "fantasy";
export type MoodboardPresetId = "neon-chase" | "sunset-romance" | "thriller-alley";

export interface MoodboardReferenceInput {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly genreHint?: MoodboardGenreHint;
}

export interface LutLiftGammaGain {
  readonly lift: readonly [number, number, number];
  readonly gamma: readonly [number, number, number];
  readonly gain: readonly [number, number, number];
}

export interface MoodboardCameraLutRecipe {
  readonly referenceId: string;
  readonly title: string;
  readonly focalLengthMm: 24 | 28 | 35 | 50 | 85 | 135;
  readonly fovHorizontalDeg: number;
  readonly contrastRatio: number;
  readonly saturationBias: number;
  readonly colorTempKelvin: number;
  readonly meanLuminance: number;
  readonly keyMoodTag: "high-key" | "low-key" | "high-contrast" | "pastel-soft" | "neon-cyber";
  readonly paletteOklch: readonly string[];
  readonly lutSeedId: string;
  readonly lutGridSize: 17 | 33;
  readonly lutLiftGammaGain: LutLiftGammaGain;
  readonly cubeHeaderPreview: string;
}

/** 무드보드 RGBA 대표 컬러·명도 분포에서 초점거리(mm), 수평 FOV, 콘트라스트, 3D LUT 시드 레시피를 산출한다. */
export function extractMoodboardCameraLut(input: MoodboardReferenceInput): MoodboardCameraLutRecipe {
  const totalPixels = Math.max(1, Math.min(Math.floor(input.rgba.length / 4), input.width * input.height));
  let sumLum = 0;
  let sumLumSq = 0;
  let sumSat = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let peakChannel = 0;
  let count = 0;

  const binR = [0, 0, 0, 0];
  const binG = [0, 0, 0, 0];
  const binB = [0, 0, 0, 0];
  const binN = [0, 0, 0, 0];

  for (let i = 0; i < totalPixels; i += 1) {
    const idx = i * 4;
    if ((input.rgba[idx + 3] ?? 0) < 16) continue;
    const r = (input.rgba[idx] ?? 0) / 255;
    const g = (input.rgba[idx + 1] ?? 0) / 255;
    const b = (input.rgba[idx + 2] ?? 0) / 255;
    const lr = srgbByteToLinear(input.rgba[idx] ?? 0);
    const lg = srgbByteToLinear(input.rgba[idx + 1] ?? 0);
    const lb = srgbByteToLinear(input.rgba[idx + 2] ?? 0);

    const lum = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    if (maxCh > peakChannel) peakChannel = maxCh;
    sumLum += lum;
    sumLumSq += lum * lum;
    sumSat += maxCh > 0.001 ? (maxCh - minCh) / maxCh : 0;
    sumR += lr;
    sumG += lg;
    sumB += lb;
    count += 1;

    const bin = Math.min(3, Math.floor(lum * 4));
    binR[bin] = (binR[bin] ?? 0) + lr;
    binG[bin] = (binG[bin] ?? 0) + lg;
    binB[bin] = (binB[bin] ?? 0) + lb;
    binN[bin] = (binN[bin] ?? 0) + 1;
  }

  const denom = Math.max(1, count);
  const meanLuminance = sumLum / denom;
  const stdDev = Math.sqrt(Math.max(0, sumLumSq / denom - meanLuminance * meanLuminance));
  const meanSat = sumSat / denom;
  const avgR = sumR / denom;
  const avgG = sumG / denom;
  const avgB = sumB / denom;
  const warmDelta = avgR - avgB;
  const colorTempKelvin = Math.round(clamp(5600 - warmDelta * 4800, 2800, 9400));
  const contrastRatio = Number(clamp(0.88 + stdDev * 2.4, 0.85, 1.75).toFixed(2));
  const saturationBias = Number(clamp((meanSat - 0.35) * 0.85, -0.35, 0.45).toFixed(2));

  let keyMoodTag: MoodboardCameraLutRecipe["keyMoodTag"] = "high-contrast";
  if (meanLuminance < 0.16) {
    keyMoodTag = "low-key";
  } else if (peakChannel >= 0.78 && meanSat > 0.48 && avgB >= avgG * 0.9 && meanLuminance < 0.5) {
    keyMoodTag = "neon-cyber";
  } else if (meanLuminance > 0.62 && stdDev < 0.22) {
    keyMoodTag = "high-key";
  } else if (meanLuminance > 0.42 && meanSat < 0.45) {
    keyMoodTag = "pastel-soft";
  }

  let focalLengthMm: 24 | 28 | 35 | 50 | 85 | 135 = 50;
  if (input.genreHint === "thriller") {
    focalLengthMm = stdDev > 0.08 ? 35 : 135;
  } else if (input.genreHint === "romance") {
    focalLengthMm = 85;
  } else if (input.genreHint === "action") {
    focalLengthMm = contrastRatio >= 1.18 ? 24 : 28;
  } else if (input.genreHint === "fantasy") {
    focalLengthMm = 28;
  } else if (keyMoodTag === "neon-cyber") {
    focalLengthMm = 24;
  } else if (keyMoodTag === "low-key") {
    focalLengthMm = 35;
  } else if (keyMoodTag === "pastel-soft") {
    focalLengthMm = 85;
  }

  const fovHorizontalDeg = Number(((2 * Math.atan(36 / (2 * focalLengthMm)) * 180) / Math.PI).toFixed(1));
  const paletteOklch: string[] = [];
  for (let b = 0; b < 4; b += 1) {
    const n = binN[b] ?? 0;
    const scale = 0.18 + b * 0.24;
    paletteOklch.push(
      n > 0
        ? linearRgbToOklchString((binR[b] ?? 0) / n, (binG[b] ?? 0) / n, (binB[b] ?? 0) / n)
        : linearRgbToOklchString(avgR * scale, avgG * scale, avgB * scale),
    );
  }

  const lift: readonly [number, number, number] = [
    Number(clamp((avgR - 0.35) * 0.12, -0.08, 0.08).toFixed(3)),
    Number(clamp((avgG - 0.35) * 0.1, -0.08, 0.08).toFixed(3)),
    Number(clamp((avgB - 0.35) * 0.12, -0.08, 0.08).toFixed(3)),
  ];
  const gamma: readonly [number, number, number] = [
    Number(clamp(1 + (avgR - avgG) * 0.18, 0.85, 1.18).toFixed(3)),
    Number(clamp(1 + (meanLuminance - 0.4) * 0.12, 0.88, 1.15).toFixed(3)),
    Number(clamp(1 + (avgB - avgR) * 0.18, 0.85, 1.18).toFixed(3)),
  ];
  const gain: readonly [number, number, number] = [
    Number(clamp(0.95 + contrastRatio * 0.08 + warmDelta * 0.15, 0.85, 1.25).toFixed(3)),
    Number(clamp(0.95 + contrastRatio * 0.06, 0.88, 1.2).toFixed(3)),
    Number(clamp(0.95 + contrastRatio * 0.08 - warmDelta * 0.15, 0.85, 1.25).toFixed(3)),
  ];

  const lutGridSize: 17 | 33 = contrastRatio >= 1.2 ? 33 : 17;
  const lutSeedId = `LUT3D-${computeDeterministicDigest32(`${input.id}|${focalLengthMm}|${contrastRatio}|${colorTempKelvin}|${paletteOklch.join(",")}`)}`;
  const cubeHeaderPreview = [
    `TITLE "${input.title} (${lutSeedId})"`,
    `LUT_3D_SIZE ${lutGridSize}`,
    `# CAMERA_FOCAL_MM ${focalLengthMm} FOV_DEG ${fovHorizontalDeg}`,
    `# KELVIN ${colorTempKelvin} CONTRAST ${contrastRatio}`,
    "0.0000 0.0000 0.0000",
    `${clamp(0.5 * gamma[0] + lift[0], 0, 1).toFixed(4)} ${clamp(0.5 * gamma[1] + lift[1], 0, 1).toFixed(4)} ${clamp(0.5 * gamma[2] + lift[2], 0, 1).toFixed(4)}`,
    `${clamp(gain[0], 0, 1).toFixed(4)} ${clamp(gain[1], 0, 1).toFixed(4)} ${clamp(gain[2], 0, 1).toFixed(4)}`,
  ].join("\n");

  return {
    referenceId: input.id, title: input.title, focalLengthMm, fovHorizontalDeg,
    contrastRatio, saturationBias, colorTempKelvin, meanLuminance: Number(meanLuminance.toFixed(3)),
    keyMoodTag, paletteOklch, lutSeedId, lutGridSize,
    lutLiftGammaGain: { lift, gamma, gain }, cubeHeaderPreview,
  };
}

export function createDemoMoodboardSample(preset: MoodboardPresetId): MoodboardReferenceInput {
  const width = 24;
  const height = 16;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;
      if (preset === "neon-chase") {
        rgba[idx] = Math.round(nx > 0.55 ? 235 : 22 + ny * 38);
        rgba[idx + 1] = Math.round(nx < 0.4 ? 210 : 34 + ny * 26);
        rgba[idx + 2] = Math.round(188 + nx * 62);
      } else if (preset === "sunset-romance") {
        rgba[idx] = Math.round(236 - ny * 24);
        rgba[idx + 1] = Math.round(178 - ny * 34 + nx * 24);
        rgba[idx + 2] = Math.round(156 - ny * 20 + nx * 20);
      } else {
        rgba[idx] = Math.round(24 + nx * 36);
        rgba[idx + 1] = Math.round(30 + ny * 34);
        rgba[idx + 2] = Math.round(48 + nx * 46);
      }
      rgba[idx + 3] = 255;
    }
  }
  if (preset === "neon-chase") return { id: "mb-neon-chase", title: "네온 도심 추격전", width, height, rgba, genreHint: "action" };
  if (preset === "sunset-romance") return { id: "mb-sunset-romance", title: "황혼 교실 로맨스", width, height, rgba, genreHint: "romance" };
  return { id: "mb-thriller-alley", title: "우천 골목 서스펜스", width, height, rgba, genreHint: "thriller" };
}

// ============================================================================
// 엔진 7: `.tsmacro` 액션 매크로 레코더 / 직렬화 / 검증 / 리플레이어
// ============================================================================

export type MacroActionKind =
  | "relight-preset"
  | "toggle-breakout"
  | "apply-lettering-token"
  | "export-goods-diecut"
  | "run-preflight"
  | "auto-level-tone";

export const ALLOWED_MACRO_ACTIONS: readonly MacroActionKind[] = [
  "relight-preset", "toggle-breakout", "apply-lettering-token",
  "export-goods-diecut", "run-preflight", "auto-level-tone",
];

export interface MacroStep {
  readonly stepId: string;
  readonly order: number;
  readonly action: MacroActionKind;
  readonly labelKo: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly enabled: boolean;
}

export interface TsMacroDocument {
  readonly format: "toonstudio.tsmacro.v1";
  readonly macroId: string;
  readonly name: string;
  readonly descriptionKo: string;
  readonly createdAtIso: string;
  readonly steps: readonly MacroStep[];
  readonly checksum: string;
}

export interface MacroRecorderSession {
  readonly recording: boolean;
  readonly name: string;
  readonly steps: readonly MacroStep[];
}

export interface MacroValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly stepCount: number;
}

export interface MacroReplayStepLog {
  readonly stepId: string;
  readonly action: MacroActionKind;
  readonly status: "executed" | "skipped" | "failed";
  readonly durationMs: number;
  readonly detailKo: string;
}

export interface MacroReplayReport {
  readonly scope: "simulation";
  readonly macroId: string;
  readonly macroName: string;
  readonly totalSteps: number;
  readonly executedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly success: boolean;
  readonly logs: readonly MacroReplayStepLog[];
}

function computeMacroChecksum(name: string, steps: readonly MacroStep[]): string {
  return computeDeterministicDigest32(
    JSON.stringify({
      name,
      steps: steps.map((s) => ({
        stepId: s.stepId, order: s.order, action: s.action, labelKo: s.labelKo, params: s.params, enabled: s.enabled,
      })),
    }),
  );
}

export function createMacroRecorder(name: string): MacroRecorderSession {
  return { recording: true, name: name.trim() || "연재 마감 원클릭 매크로", steps: [] };
}

export function recordMacroStep(
  session: MacroRecorderSession,
  action: MacroActionKind,
  labelKo: string,
  params: Readonly<Record<string, string | number | boolean>>,
  enabled = true,
): MacroRecorderSession {
  const order = session.steps.length + 1;
  return {
    ...session,
    steps: [
      ...session.steps,
      { stepId: `STEP-${String(order).padStart(2, "0")}`, order, action, labelKo: labelKo.trim() || action, params: { ...params }, enabled },
    ],
  };
}

export function finalizeTsMacro(
  session: MacroRecorderSession,
  descriptionKo: string,
  createdAtIso = "2026-11-25T06:00:00.000Z",
): TsMacroDocument {
  const checksum = computeMacroChecksum(session.name, session.steps);
  return {
    format: "toonstudio.tsmacro.v1",
    macroId: `TSMACRO-${checksum}`,
    name: session.name,
    descriptionKo: descriptionKo.trim() || "반복 제작 단계 일괄 자동화 매크로",
    createdAtIso,
    steps: session.steps,
    checksum,
  };
}

export function serializeTsMacro(doc: TsMacroDocument): string {
  return JSON.stringify(doc, null, 2);
}

function isMacroStep(value: unknown): value is MacroStep {
  if (typeof value !== "object" || value === null) return false;
  const step = value as Partial<MacroStep>;
  return typeof step.stepId === "string" && typeof step.labelKo === "string"
    && typeof step.order === "number" && Number.isInteger(step.order) && step.order > 0
    && typeof step.enabled === "boolean" && typeof step.action === "string"
    && ALLOWED_MACRO_ACTIONS.includes(step.action)
    && typeof step.params === "object" && step.params !== null && !Array.isArray(step.params)
    && Object.values(step.params).every((v) => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)));
}

export function parseAndValidateTsMacro(rawJson: string): {
  readonly document: TsMacroDocument | null;
  readonly validation: MacroValidationResult;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { document: null, validation: { valid: false, errors: [".tsmacro JSON 구문이 올바르지 않습니다."], stepCount: 0 } };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { document: null, validation: { valid: false, errors: ["매크로 루트 객체가 비어 있습니다."], stepCount: 0 } };
  }

  const candidate = parsed as Partial<TsMacroDocument>;
  const errors: string[] = [];
  if (candidate.format !== "toonstudio.tsmacro.v1") errors.push("지원하지 않는 .tsmacro 포맷 버전입니다.");
  if (!candidate.name || typeof candidate.name !== "string") errors.push("매크로 이름(name)이 누락되었습니다.");
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) errors.push("최소 1개 이상의 실행 단계(steps)가 필요합니다.");

  const rawSteps: readonly unknown[] = Array.isArray(candidate.steps) ? candidate.steps : [];
  const steps = rawSteps.filter(isMacroStep);
  if (steps.length !== rawSteps.length) errors.push("실행 단계의 필드·액션·파라미터 형식이 올바르지 않습니다.");
  if (typeof candidate.name === "string" && steps.length > 0 && steps.length === rawSteps.length) {
    const expectedChecksum = computeMacroChecksum(candidate.name, steps);
    if (candidate.checksum !== expectedChecksum) {
      errors.push(`체크섬 불일치(예상 ${expectedChecksum}, 실제 ${String(candidate.checksum ?? "없음")}).`);
    }
  }

  if (errors.length > 0) {
    return { document: null, validation: { valid: false, errors, stepCount: steps.length } };
  }
  return { document: candidate as TsMacroDocument, validation: { valid: true, errors: [], stepCount: steps.length } };
}

/** 단계 구성을 검사하는 합성 리플레이이며 편집기 명령이나 파일 출력을 실행하지 않는다. */
export function replayTsMacro(doc: TsMacroDocument): MacroReplayReport {
  const logs: MacroReplayStepLog[] = [];
  let executedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const step of doc.steps) {
    if (!step.enabled) {
      skippedCount += 1;
      logs.push({ stepId: step.stepId, action: step.action, status: "skipped", durationMs: 0, detailKo: `${step.labelKo} — 비활성화되어 건너뜀` });
      continue;
    }
    if (!ALLOWED_MACRO_ACTIONS.includes(step.action)) {
      failedCount += 1;
      logs.push({ stepId: step.stepId, action: step.action, status: "failed", durationMs: 1, detailKo: `알 수 없는 액션(${String(step.action)}) 실행 실패` });
      continue;
    }
    const paramSummary = Object.entries(step.params).map(([k, v]) => `${k}=${String(v)}`).join(", ");
    executedCount += 1;
    logs.push({ stepId: step.stepId, action: step.action, status: "executed", durationMs: 4 + ((step.order * 3) % 11), detailKo: `${step.labelKo} 예제 단계 검토 (${paramSummary || "기본 파라미터"}, 시간은 합성값)` });
  }

  return {
    scope: "simulation",
    macroId: doc.macroId, macroName: doc.name, totalSteps: doc.steps.length,
    executedCount, skippedCount, failedCount, success: failedCount === 0, logs,
  };
}

export function createDefaultProTsMacro(): TsMacroDocument {
  let rec = createMacroRecorder("클라이맥스 컷 출고 일괄 매크로");
  rec = recordMacroStep(rec, "relight-preset", "3층 리라이트 노을 프리셋 적용", { preset: "sunset", exposureBias: 0.1 });
  rec = recordMacroStep(rec, "toggle-breakout", "칼날·효과음 컷 돌파 마스킹 활성화", { layerId: "layer-sword-blade", enabled: true });
  rec = recordMacroStep(rec, "apply-lettering-token", "외침 식자 토큰 회차 일괄 동기화", { tokenId: "tok-seoyeon-shout" });
  rec = recordMacroStep(rec, "run-preflight", "CMYK TAC 300% 및 플랫폼 투고 프리플라이트", { target: "naver-webtoon", maxTacPct: 300 });
  return finalizeTsMacro(rec, "리라이트→컷돌파→식자동기화→프리플라이트 4단계 연재 마감 원클릭 실행");
}

// ============================================================================
// 엔진 8: 공모전·출판사 원클릭 투고 패키지 빌더
// ============================================================================

export type SubmissionTargetId = "naver-webtoon" | "kakao-page" | "lezhin" | "print-tankobon";

export interface SubmissionTargetSpec {
  readonly id: SubmissionTargetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly recommendedWidthPx: number;
  readonly maxTotalSizeMb: number;
  readonly maxSliceSizeMb: number;
  readonly minVerticalMarginPx: number;
  readonly minDpi: number;
  readonly episodeLabelExample: string;
}

export const SUBMISSION_TARGET_SPECS: Readonly<Record<SubmissionTargetId, SubmissionTargetSpec>> = {
  "naver-webtoon": { id: "naver-webtoon", labelKo: "네이버 웹툰 · 지상최대공모전", labelEn: "NAVER Webtoon Contest", minWidthPx: 690, maxWidthPx: 800, recommendedWidthPx: 690, maxTotalSizeMb: 20, maxSliceSizeMb: 2, minVerticalMarginPx: 40, minDpi: 72, episodeLabelExample: "01화" },
  "kakao-page": { id: "kakao-page", labelKo: "카카오페이지 · 카카오웹툰", labelEn: "KakaoPage / Kakao Webtoon", minWidthPx: 720, maxWidthPx: 1440, recommendedWidthPx: 720, maxTotalSizeMb: 30, maxSliceSizeMb: 3, minVerticalMarginPx: 60, minDpi: 72, episodeLabelExample: "EP01 / 01화" },
  lezhin: { id: "lezhin", labelKo: "레진코믹스 연재 투고", labelEn: "Lezhin Comics Submission", minWidthPx: 1000, maxWidthPx: 1280, recommendedWidthPx: 1280, maxTotalSizeMb: 40, maxSliceSizeMb: 5, minVerticalMarginPx: 50, minDpi: 72, episodeLabelExample: "01화" },
  "print-tankobon": { id: "print-tankobon", labelKo: "단행본 출판 투고 (B6 300DPI)", labelEn: "Print Tankobon (B6 300DPI)", minWidthPx: 1512, maxWidthPx: 2600, recommendedWidthPx: 1583, maxTotalSizeMb: 150, maxSliceSizeMb: 18, minVerticalMarginPx: 36, minDpi: 300, episodeLabelExample: "01권 01화" },
};

export interface SubmissionEpisodeInput {
  readonly seriesTitle: string;
  readonly authorName: string;
  readonly episodeLabel: string;
  readonly widthPx: number;
  readonly sliceCount: number;
  readonly sliceSizeMb: number;
  readonly totalSizeMb: number;
  readonly topMarginPx: number;
  readonly bottomMarginPx: number;
  readonly dpi: number;
}

export type SubmissionCheckRuleId = "width" | "total-size" | "slice-size" | "margin" | "episode-label" | "dpi" | "input";

export interface SubmissionCheckItem {
  readonly ruleId: SubmissionCheckRuleId;
  readonly labelKo: string;
  readonly passed: boolean;
  readonly severity: "pass" | "error";
  readonly actual: string;
  readonly expected: string;
}

export interface SubmissionPackageFileEntry {
  readonly path: string;
  readonly role: "episode-slice" | "thumbnail" | "manifest" | "synopsis";
  readonly estimatedKb: number;
}

export interface SubmissionPackageManifest {
  readonly scope: "input-check-only";
  readonly filesMaterialized: false;
  readonly manifestFormat: "toonstudio.submission.v1";
  readonly targetId: SubmissionTargetId;
  readonly targetLabelKo: string;
  readonly seriesTitle: string;
  readonly authorName: string;
  readonly episodeLabel: string;
  /** 기존 필드명이며 입력한 수치의 예제 규격 통과만 뜻한다. 실제 투고 준비 완료가 아니다. */
  readonly readyToSubmit: boolean;
  readonly passCount: number;
  readonly failCount: number;
  readonly checks: readonly SubmissionCheckItem[];
  readonly files: readonly SubmissionPackageFileEntry[];
  readonly packageChecksum: string;
  readonly manifestJson: string;
}

const EPISODE_LABEL_REGEX = /^(?:EP\s?\d{1,3}|\d{1,3}권(?:\s+\d{1,3}화)?|\d{1,3}화)(?:\s*[-·:].+)?$/u;

export function createPresetSubmissionInput(targetId: SubmissionTargetId): SubmissionEpisodeInput {
  const spec = SUBMISSION_TARGET_SPECS[targetId];
  return {
    seriesTitle: "은월의 기록",
    authorName: "김도현",
    episodeLabel: targetId === "print-tankobon" ? "01권 01화 - 자정의 성벽" : "01화 - 자정의 성벽",
    widthPx: spec.recommendedWidthPx,
    sliceCount: targetId === "print-tankobon" ? 24 : 12,
    sliceSizeMb: Number((spec.maxSliceSizeMb * 0.62).toFixed(2)),
    totalSizeMb: Number((spec.maxTotalSizeMb * 0.58).toFixed(2)),
    topMarginPx: spec.minVerticalMarginPx + 12,
    bottomMarginPx: spec.minVerticalMarginPx + 16,
    dpi: spec.minDpi,
  };
}

/** 네이버·카카오·레진·단행본 투고 규격 자동 검사 + 매니페스트 패키지를 빌드한다. */
export function buildSubmissionPackage(targetId: SubmissionTargetId, input: SubmissionEpisodeInput): SubmissionPackageManifest {
  const spec = SUBMISSION_TARGET_SPECS[targetId];
  const trimmedLabel = input.episodeLabel.trim();

  const checks: SubmissionCheckItem[] = [
    { ruleId: "width", labelKo: "원고 가로 폭(px)", passed: input.widthPx >= spec.minWidthPx && input.widthPx <= spec.maxWidthPx, severity: input.widthPx >= spec.minWidthPx && input.widthPx <= spec.maxWidthPx ? "pass" : "error", actual: `${input.widthPx}px`, expected: `${spec.minWidthPx}~${spec.maxWidthPx}px` },
    { ruleId: "total-size", labelKo: "회차 총 용량(MB)", passed: input.totalSizeMb > 0 && input.totalSizeMb <= spec.maxTotalSizeMb, severity: input.totalSizeMb > 0 && input.totalSizeMb <= spec.maxTotalSizeMb ? "pass" : "error", actual: `${input.totalSizeMb}MB`, expected: `<= ${spec.maxTotalSizeMb}MB` },
    { ruleId: "slice-size", labelKo: "분할 파일당 용량(MB)", passed: input.sliceSizeMb > 0 && input.sliceSizeMb <= spec.maxSliceSizeMb, severity: input.sliceSizeMb > 0 && input.sliceSizeMb <= spec.maxSliceSizeMb ? "pass" : "error", actual: `${input.sliceSizeMb}MB`, expected: `<= ${spec.maxSliceSizeMb}MB` },
    { ruleId: "margin", labelKo: "상·하 안전 여백(px)", passed: input.topMarginPx >= spec.minVerticalMarginPx && input.bottomMarginPx >= spec.minVerticalMarginPx, severity: input.topMarginPx >= spec.minVerticalMarginPx && input.bottomMarginPx >= spec.minVerticalMarginPx ? "pass" : "error", actual: `상 ${input.topMarginPx}px / 하 ${input.bottomMarginPx}px`, expected: `각 >= ${spec.minVerticalMarginPx}px` },
    { ruleId: "episode-label", labelKo: "회차·권수 표기 규칙", passed: EPISODE_LABEL_REGEX.test(trimmedLabel), severity: EPISODE_LABEL_REGEX.test(trimmedLabel) ? "pass" : "error", actual: trimmedLabel || "(비어 있음)", expected: spec.episodeLabelExample },
    { ruleId: "dpi", labelKo: "해상도(DPI)", passed: input.dpi >= spec.minDpi, severity: input.dpi >= spec.minDpi ? "pass" : "error", actual: `${input.dpi}DPI`, expected: `>= ${spec.minDpi}DPI` },
  ];

  const positiveNumbers = [input.widthPx, input.sliceSizeMb, input.totalSizeMb, input.dpi];
  const validSliceCount = Number.isInteger(input.sliceCount) && input.sliceCount >= 1 && input.sliceCount <= 80;
  const validInput = validSliceCount && positiveNumbers.every((value) => Number.isFinite(value) && value > 0)
    && [input.topMarginPx, input.bottomMarginPx].every((value) => Number.isFinite(value) && value >= 0)
    && Number.isInteger(input.widthPx) && input.seriesTitle.trim().length > 0 && input.authorName.trim().length > 0;
  if (!validInput) checks.push({ ruleId: "input", labelKo: "입력값 형식", passed: false, severity: "error", actual: "유효하지 않은 입력", expected: "제목·작가명, 유한한 양수 규격, 0 이상 여백, 정수 폭과 분할 수 1~80" });

  const passCount = checks.filter((c) => c.passed).length;
  const failCount = checks.length - passCount;
  const readyToSubmit = failCount === 0;
  const sliceCount = validInput ? input.sliceCount : 0;
  const ext = targetId === "print-tankobon" ? "tif" : "jpg";

  const files: SubmissionPackageFileEntry[] = [];
  for (let i = 1; i <= sliceCount; i += 1) {
    files.push({ path: `slices/${targetId}_cut_${String(i).padStart(3, "0")}.${ext}`, role: "episode-slice", estimatedKb: Math.round(input.sliceSizeMb * 1024) });
  }
  files.push(
    { path: `assets/thumbnail_${spec.recommendedWidthPx}w.png`, role: "thumbnail", estimatedKb: 240 },
    { path: "docs/synopsis_and_character_sheet.pdf", role: "synopsis", estimatedKb: 420 },
    { path: "submission.manifest.json", role: "manifest", estimatedKb: 4 },
  );

  const packageChecksum = computeDeterministicDigest32(
    `${targetId}|${input.seriesTitle}|${trimmedLabel}|${input.widthPx}|${input.totalSizeMb}|${passCount}/${checks.length}`,
  );
  const manifestPayload = {
    scope: "input-check-only" as const, filesMaterialized: false as const,
    manifestFormat: "toonstudio.submission.v1" as const,
    targetId, targetLabelKo: spec.labelKo, seriesTitle: input.seriesTitle.trim(), authorName: input.authorName.trim(),
    episodeLabel: trimmedLabel, readyToSubmit, passCount, failCount, packageChecksum, checks, files,
  };
  return { ...manifestPayload, checks, manifestJson: JSON.stringify(manifestPayload, null, 2) };
}
