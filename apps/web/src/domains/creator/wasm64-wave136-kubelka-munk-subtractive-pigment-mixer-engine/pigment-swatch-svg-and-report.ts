/**
 * Wave 136 — 순수 OKLCH 안료 혼색 비교 SVG 렌더러, 동기 FIPS 180-4 SHA-256 매니페스트 해시 및
 * 자연스러운 한국어 채색 감독 QA 브리프 생성기.
 *
 * - SVG 출력 전체에 원시 hex/rgb/hsl 색상 문자열을 일절 사용하지 않고 순수 `oklch(...)`만 사용
 * - XML/XSS 특수문자(`&`, `<`, `>`, `"`, `'`) 완전 이스케이프 및 모든 좌표 유한수 가드
 * - 순수 ES2017 동기 FIPS 180-4 SHA-256으로 안료 레시피 결정론적 지문 해시 산출
 */

import {
  clampFinite,
  formatOklchCss,
  getStudioPigmentPreset,
  SPECTRAL_BAND_COUNT,
  SPECTRAL_WAVELENGTHS_NM,
  type SpectralTuple10,
  type StudioPigmentId,
  type SubtractiveVsRgbComparison,
} from "./kubelka-munk-spectral-pigments";
import {
  compareMediumGlazingTriplet,
  getWetMediumPreset,
  type MultiLayerGlazingResult,
  type PaperSubstrateId,
  type WatercolorEdgeDarkeningResult,
  type WetMediumPresetId,
} from "./wet-medium-glazing-and-backrun";
import type { SubtractivePigmentWgslValidationReport } from "./subtractive-pigment-wgsl";

export type PigmentAuditGrade = "PASS" | "WARN" | "FAIL";

export interface PigmentRecipeManifestInput {
  readonly pigmentAId: StudioPigmentId;
  readonly pigmentBId: StudioPigmentId;
  readonly midpointRatioB: number;
  readonly mediumPreset: WetMediumPresetId;
  readonly substrateId: PaperSubstrateId;
  readonly coatCount: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly simulationSteps: number;
}

export interface PigmentMixSvgOptions {
  readonly titleKo?: string;
  readonly subtitleKo?: string;
  readonly artistNoteKo?: string;
  readonly glazingTriplet?: Readonly<Record<WetMediumPresetId, MultiLayerGlazingResult>>;
  readonly recipeHash?: string;
}

export interface PigmentAuditCheckItem {
  readonly id: string;
  readonly labelKo: string;
  readonly passed: boolean;
  readonly measuredText: string;
  readonly thresholdText: string;
  readonly detailKo: string;
}

export interface PigmentMixAuditReportKo {
  readonly grade: PigmentAuditGrade;
  readonly passed: boolean;
  readonly recipeHash: string;
  readonly pigmentPairLabelKo: string;
  readonly mediumNameKo: string;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly bulletLinesKo: readonly string[];
  readonly checks: readonly PigmentAuditCheckItem[];
}

export interface SummarizePigmentAuditInput {
  readonly comparison: SubtractiveVsRgbComparison;
  readonly backrun: WatercolorEdgeDarkeningResult;
  readonly glazingTriplet: Readonly<Record<WetMediumPresetId, MultiLayerGlazingResult>>;
  readonly ksRoundTripMaxError: number;
  readonly wgslValidation: SubtractivePigmentWgslValidationReport;
  readonly generatedDateIso?: string;
}

const SVG_OKLCH = {
  pageBg: "oklch(0.978 0.008 88)",
  panelBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.955 0.011 86)",
  chartBg: "oklch(0.970 0.006 88)",
  borderSoft: "oklch(0.320 0.032 156 / 0.20)",
  borderStrong: "oklch(0.280 0.045 156 / 0.42)",
  gridLine: "oklch(0.420 0.020 156 / 0.16)",
  inkPrimary: "oklch(0.215 0.036 156)",
  inkSecondary: "oklch(0.415 0.024 156)",
  inkMuted: "oklch(0.525 0.018 156)",
  accentForest: "oklch(0.345 0.078 156)",
  curvePigmentA: "oklch(0.455 0.175 262)",
  curvePigmentB: "oklch(0.685 0.165 92)",
  curveMixKm: "oklch(0.485 0.148 145)",
  curveBackrun: "oklch(0.395 0.132 238)",
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

// FIPS 180-4 SHA-256 표준 라운드 상수 64개
const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * 순수 ES2017 동기 FIPS 180-4 SHA-256 해시 (외부 WebCrypto·Node crypto 의존 없음).
 */
export function sha256HexSync(input: string): string {
  const msg = encodeUtf8Bytes(input);
  const bitLen = msg.length * 8;
  const paddedLen = Math.ceil((msg.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(msg, 0);
  buf[msg.length] = 0x80;

  const hiBits = Math.floor(bitLen / 0x100000000) >>> 0;
  const loBits = bitLen >>> 0;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, hiBits, false);
  view.setUint32(paddedLen - 4, loBits, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  let hex = "";
  for (let i = 0; i < words.length; i += 1) {
    hex += (words[i] >>> 0).toString(16).padStart(8, "0");
  }
  return hex;
}

/** 안료 조합·매체·기판·시뮬레이션 설정을 정규화 직렬화해 결정론적 SHA-256 레시피 해시를 생성한다. */
export function computePigmentRecipeManifestHash(manifest: PigmentRecipeManifestInput): string {
  const canonical = JSON.stringify({
    coatCount: Math.floor(manifest.coatCount),
    mediumPreset: manifest.mediumPreset,
    midpointRatioB: Number(clampFinite(manifest.midpointRatioB, 0, 1).toFixed(6)),
    pigmentAId: manifest.pigmentAId,
    pigmentBId: manifest.pigmentBId,
    schema: "toonstudio-wave136-km-pigment-recipe/v1",
    simulationSteps: Math.floor(manifest.simulationSteps),
    substrateId: manifest.substrateId,
    tileHeight: Math.floor(manifest.tileHeight),
    tileWidth: Math.floor(manifest.tileWidth),
  });
  return sha256HexSync(canonical);
}

/** XML/SVG 텍스트·속성 노드의 특수문자를 완전 이스케이프해 XSS·구조 깨짐을 차단한다. */
export function escapePigmentXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(value: number, digits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(digits);
}

function renderGradientStripPanel(
  comparison: SubtractiveVsRgbComparison,
  x: number,
  y: number,
  w: number,
  h: number,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(w)}" height="${fmtNum(h)}" rx="10" fill="${SVG_OKLCH.panelBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtNum(x + 16)}" y="${fmtNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${SVG_OKLCH.inkPrimary}">감산 Kubelka-Munk 혼색 vs 일반 RGB 선형 혼색</text>`,
  );
  out.push(
    `  <text x="${fmtNum(x + 16)}" y="${fmtNum(y + 42)}" font-family="${FONT_MONO}" font-size="10.5" fill="${SVG_OKLCH.inkSecondary}">${escapePigmentXml(comparison.pigmentANameKo)} + ${escapePigmentXml(comparison.pigmentBNameKo)} · 중앙 채도 우위 +${fmtNum(comparison.chromaAdvantage, 4)} (${fmtNum(comparison.chromaRatio, 2)}x)</text>`,
  );

  const stops = comparison.stops;
  const stripX = x + 16;
  const stripW = w - 32;
  const cellW = stripW / Math.max(1, stops.length);

  out.push(
    `  <text x="${fmtNum(stripX)}" y="${fmtNum(y + 66)}" font-family="${FONT_SANS}" font-size="11" font-weight="600" fill="${SVG_OKLCH.accentForest}">Kubelka-Munk 10-밴드 감산 혼색 (중앙 OKLCH ${fmtNum(comparison.subtractiveMidpoint.oklch.l, 2)} / C ${fmtNum(comparison.subtractiveMidpoint.oklch.c, 3)} / H ${fmtNum(comparison.subtractiveMidpoint.oklch.h, 1)}°)</text>`,
  );
  for (let i = 0; i < stops.length; i += 1) {
    const sx = stripX + i * cellW;
    out.push(
      `  <rect x="${fmtNum(sx)}" y="${fmtNum(y + 74)}" width="${fmtNum(cellW + 0.5)}" height="42" fill="${stops[i].subtractiveOklchCss}" />`,
    );
  }
  out.push(
    `  <rect x="${fmtNum(stripX)}" y="${fmtNum(y + 74)}" width="${fmtNum(stripW)}" height="42" rx="4" fill="none" stroke="${SVG_OKLCH.borderStrong}" stroke-width="1" />`,
  );

  out.push(
    `  <text x="${fmtNum(stripX)}" y="${fmtNum(y + 138)}" font-family="${FONT_SANS}" font-size="11" font-weight="600" fill="${SVG_OKLCH.inkSecondary}">디지털 RGB 선형 보간 (중앙 OKLCH ${fmtNum(comparison.rgbLinearMidpointOklch.l, 2)} / C ${fmtNum(comparison.rgbLinearMidpointOklch.c, 3)} / H ${fmtNum(comparison.rgbLinearMidpointOklch.h, 1)}°)</text>`,
  );
  for (let i = 0; i < stops.length; i += 1) {
    const sx = stripX + i * cellW;
    out.push(
      `  <rect x="${fmtNum(sx)}" y="${fmtNum(y + 146)}" width="${fmtNum(cellW + 0.5)}" height="42" fill="${stops[i].rgbLinearOklchCss}" />`,
    );
  }
  out.push(
    `  <rect x="${fmtNum(stripX)}" y="${fmtNum(y + 146)}" width="${fmtNum(stripW)}" height="42" rx="4" fill="none" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );

  // 중앙 50:50 마커선
  const midX = stripX + stripW * comparison.midpointRatioB;
  out.push(
    `  <line x1="${fmtNum(midX)}" y1="${fmtNum(y + 70)}" x2="${fmtNum(midX)}" y2="${fmtNum(y + 194)}" stroke="${SVG_OKLCH.inkPrimary}" stroke-width="1.4" stroke-dasharray="4 3" />`,
  );
  return out;
}

function spectralCurvePoints(
  spectrum: SpectralTuple10,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
): string {
  const pts: string[] = [];
  for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
    const px = cx + (i / (SPECTRAL_BAND_COUNT - 1)) * cw;
    const py = cy + ch - clampFinite(spectrum[i], 0, 1) * (ch - 12) - 6;
    pts.push(`${fmtNum(px)},${fmtNum(py)}`);
  }
  return pts.join(" ");
}

function renderSpectralCurvePanel(
  comparison: SubtractiveVsRgbComparison,
  x: number,
  y: number,
  w: number,
  h: number,
): readonly string[] {
  const out: string[] = [];
  const presetA = getStudioPigmentPreset(comparison.pigmentAId);
  const presetB = getStudioPigmentPreset(comparison.pigmentBId);
  out.push(
    `  <rect x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(w)}" height="${fmtNum(h)}" rx="10" fill="${SVG_OKLCH.panelBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtNum(x + 16)}" y="${fmtNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${SVG_OKLCH.inkPrimary}">10-밴드 가시광선 반사율 R(λ) 스펙트럼 (410~680nm)</text>`,
  );

  const cx = x + 36;
  const cy = y + 40;
  const cw = w - 54;
  const ch = h - 74;
  out.push(
    `  <rect x="${fmtNum(cx)}" y="${fmtNum(cy)}" width="${fmtNum(cw)}" height="${fmtNum(ch)}" rx="6" fill="${SVG_OKLCH.chartBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );

  for (let g = 1; g <= 3; g += 1) {
    const gy = cy + (ch * g) / 4;
    out.push(
      `  <line x1="${fmtNum(cx)}" y1="${fmtNum(gy)}" x2="${fmtNum(cx + cw)}" y2="${fmtNum(gy)}" stroke="${SVG_OKLCH.gridLine}" stroke-width="1" />`,
    );
  }

  out.push(
    `  <polyline fill="none" stroke="${SVG_OKLCH.curvePigmentA}" stroke-width="2" stroke-dasharray="5 3" points="${spectralCurvePoints(presetA.reflectance, cx, cy, cw, ch)}" />`,
  );
  out.push(
    `  <polyline fill="none" stroke="${SVG_OKLCH.curvePigmentB}" stroke-width="2" stroke-dasharray="5 3" points="${spectralCurvePoints(presetB.reflectance, cx, cy, cw, ch)}" />`,
  );
  out.push(
    `  <polyline fill="none" stroke="${SVG_OKLCH.curveMixKm}" stroke-width="2.8" points="${spectralCurvePoints(comparison.subtractiveMidpoint.reflectance, cx, cy, cw, ch)}" />`,
  );

  for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 3) {
    const lx = cx + (i / (SPECTRAL_BAND_COUNT - 1)) * cw;
    out.push(
      `  <text x="${fmtNum(lx)}" y="${fmtNum(cy + ch + 14)}" text-anchor="middle" font-family="${FONT_MONO}" font-size="9.5" fill="${SVG_OKLCH.inkMuted}">${String(SPECTRAL_WAVELENGTHS_NM[i])}nm</text>`,
    );
  }
  out.push(
    `  <text x="${fmtNum(cx)}" y="${fmtNum(cy + ch + 28)}" font-family="${FONT_SANS}" font-size="10" fill="${SVG_OKLCH.inkSecondary}">점선: ${escapePigmentXml(presetA.nameKo)} / ${escapePigmentXml(presetB.nameKo)} · 굵은 실선: 감산 혼색 R(λ)</text>`,
  );
  return out;
}

function renderGlazingTripletPanel(
  triplet: Readonly<Record<WetMediumPresetId, MultiLayerGlazingResult>>,
  x: number,
  y: number,
  w: number,
  h: number,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(w)}" height="${fmtNum(h)}" rx="10" fill="${SVG_OKLCH.panelBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtNum(x + 16)}" y="${fmtNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${SVG_OKLCH.inkPrimary}">매체별 다층 글레이징 적층 스트립 (1~4회 도포)</text>`,
  );

  const media: readonly WetMediumPresetId[] = [
    "watercolor-transparent",
    "gouache-opaque",
    "alcohol-marker-blend",
  ];
  const rowStart = y + 46;
  const rowGap = 62;
  const swatchX = x + 152;
  const swatchTotalW = w - 168;

  for (let m = 0; m < media.length; m += 1) {
    const id = media[m];
    const preset = getWetMediumPreset(id);
    const glazing = triplet[id];
    const ry = rowStart + m * rowGap;
    out.push(
      `  <text x="${fmtNum(x + 16)}" y="${fmtNum(ry + 18)}" font-family="${FONT_SANS}" font-size="11.5" font-weight="600" fill="${SVG_OKLCH.inkPrimary}">${escapePigmentXml(preset.nameKo)}</text>`,
    );
    out.push(
      `  <text x="${fmtNum(x + 16)}" y="${fmtNum(ry + 34)}" font-family="${FONT_MONO}" font-size="9.5" fill="${SVG_OKLCH.inkSecondary}">은폐율 ${(glazing.finalHidingPower * 100).toFixed(0)}% · 최종 L ${fmtNum(glazing.finalOklch.l, 2)}</text>`,
    );

    const coats = glazing.coats;
    const cellW = swatchTotalW / Math.max(1, coats.length);
    for (let c = 0; c < coats.length; c += 1) {
      const sx = swatchX + c * cellW;
      out.push(
        `  <rect x="${fmtNum(sx)}" y="${fmtNum(ry)}" width="${fmtNum(cellW - 4)}" height="42" rx="5" fill="${coats[c].oklchCss}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
      );
      out.push(
        `  <text x="${fmtNum(sx + 6)}" y="${fmtNum(ry + 14)}" font-family="${FONT_MONO}" font-size="9" fill="${coats[c].oklch.l > 0.56 ? SVG_OKLCH.inkPrimary : SVG_OKLCH.panelBg}">${String(coats[c].coatIndex)}회</text>`,
      );
    }
  }
  return out;
}

function renderBackrunPanel(
  backrun: WatercolorEdgeDarkeningResult,
  x: number,
  y: number,
  w: number,
  h: number,
): readonly string[] {
  const out: string[] = [];
  out.push(
    `  <rect x="${fmtNum(x)}" y="${fmtNum(y)}" width="${fmtNum(w)}" height="${fmtNum(h)}" rx="10" fill="${SVG_OKLCH.panelBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  out.push(
    `  <text x="${fmtNum(x + 16)}" y="${fmtNum(y + 24)}" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="${SVG_OKLCH.inkPrimary}">수채 모세관 엣지 다크닝(Coffee-Ring) 타일 &amp; 반경 프로파일</text>`,
  );
  out.push(
    `  <text x="${fmtNum(x + 16)}" y="${fmtNum(y + 42)}" font-family="${FONT_MONO}" font-size="10" fill="${SVG_OKLCH.inkSecondary}">테두리/내부 농도비 ${fmtNum(backrun.edgeToInteriorRatio, 2)}x · 질량 보존 오차 ${backrun.massConservationRelativeError.toExponential(2)}</text>`,
  );

  // 좌측: 16×16 다운샘플 타일 미리보기 (순수 OKLCH)
  const tileSize = 152;
  const tileX = x + 16;
  const tileY = y + 56;
  const gridN = 16;
  const cellPx = tileSize / gridN;
  out.push(
    `  <rect x="${fmtNum(tileX)}" y="${fmtNum(tileY)}" width="${fmtNum(tileSize)}" height="${fmtNum(tileSize)}" rx="4" fill="${SVG_OKLCH.chartBg}" stroke="${SVG_OKLCH.borderStrong}" stroke-width="1" />`,
  );
  for (let gy = 0; gy < gridN; gy += 1) {
    const sy = Math.min(backrun.height - 1, Math.floor((gy / gridN) * backrun.height));
    for (let gx = 0; gx < gridN; gx += 1) {
      const sx = Math.min(backrun.width - 1, Math.floor((gx / gridN) * backrun.width));
      const idx = sy * backrun.width + sx;
      const cellCss = formatOklchCss({
        l: backrun.tileLightnessField[idx],
        c: backrun.tileChromaField[idx],
        h: backrun.tileHueField[idx],
      });
      out.push(
        `  <rect x="${fmtNum(tileX + gx * cellPx)}" y="${fmtNum(tileY + gy * cellPx)}" width="${fmtNum(cellPx + 0.4)}" height="${fmtNum(cellPx + 0.4)}" fill="${cellCss}" />`,
      );
    }
  }

  // 우측: 반경별 안료 농도 프로파일 곡선
  const cx = tileX + tileSize + 24;
  const cy = tileY;
  const cw = w - tileSize - 56;
  const ch = tileSize;
  out.push(
    `  <rect x="${fmtNum(cx)}" y="${fmtNum(cy)}" width="${fmtNum(cw)}" height="${fmtNum(ch)}" rx="6" fill="${SVG_OKLCH.chartBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );

  const profile = backrun.radialProfile;
  const maxConc = Math.max(
    1.5,
    profile.reduce((acc, s) => (s.meanConcentration > acc ? s.meanConcentration : acc), 0) * 1.12,
  );
  const pts: string[] = [];
  for (let i = 0; i < profile.length; i += 1) {
    const px = cx + (i / Math.max(1, profile.length - 1)) * cw;
    const py = cy + ch - (clampFinite(profile[i].meanConcentration, 0, maxConc) / maxConc) * (ch - 14) - 6;
    pts.push(`${fmtNum(px)},${fmtNum(py)}`);
  }
  out.push(
    `  <polyline fill="none" stroke="${SVG_OKLCH.curveBackrun}" stroke-width="2.5" points="${pts.join(" ")}" />`,
  );
  out.push(
    `  <text x="${fmtNum(cx + 6)}" y="${fmtNum(cy + ch + 15)}" font-family="${FONT_MONO}" font-size="9.5" fill="${SVG_OKLCH.inkMuted}">중심(r=0) → 접촉선 테두리(r=1)</text>`,
  );
  return out;
}

/**
 * 감산 KM vs RGB 혼색 띠, 10-밴드 스펙트럼 곡선, 매체별 글레이징 스트립, 수채 엣지 다크닝을
 * 순수 `oklch(...)` 색상만 사용하는 인쇄 안전 SVG 진단 시트로 렌더링한다.
 */
export function renderPigmentMixComparisonSvg(
  comparison: SubtractiveVsRgbComparison,
  backrun: WatercolorEdgeDarkeningResult,
  options?: PigmentMixSvgOptions,
): string {
  const title = options?.titleKo ?? "Wave 136 — Kubelka-Munk 감산 안료 혼색 · 수채 엣지 다크닝 진단 시트";
  const subtitle =
    options?.subtitleKo ??
    `${comparison.pigmentANameKo} + ${comparison.pigmentBNameKo} · ${getWetMediumPreset(backrun.mediumPreset).nameKo}`;
  const glazingTriplet =
    options?.glazingTriplet ?? compareMediumGlazingTriplet(comparison.pigmentAId, 4, backrun.substrateId);
  const hash =
    options?.recipeHash ??
    computePigmentRecipeManifestHash({
      pigmentAId: comparison.pigmentAId,
      pigmentBId: comparison.pigmentBId,
      midpointRatioB: comparison.midpointRatioB,
      mediumPreset: backrun.mediumPreset,
      substrateId: backrun.substrateId,
      coatCount: glazingTriplet["watercolor-transparent"].coats.length,
      tileWidth: backrun.width,
      tileHeight: backrun.height,
      simulationSteps: backrun.steps,
    });

  const badgeFill = comparison.chromaAdvantage > 0 ? SVG_OKLCH.passFill : SVG_OKLCH.warnFill;
  const badgeStroke = comparison.chromaAdvantage > 0 ? SVG_OKLCH.passStroke : SVG_OKLCH.warnStroke;
  const badgeText = comparison.chromaAdvantage > 0 ? SVG_OKLCH.passText : SVG_OKLCH.warnText;
  const badgeLabel = comparison.isVividGreenMidpoint
    ? "녹색 채도 우위 검증 완료"
    : "감산 스펙트럼 혼색 검증";

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 680" width="1040" height="680" role="img" aria-label="${escapePigmentXml(title)}">`,
    `  <rect x="0" y="0" width="1040" height="680" fill="${SVG_OKLCH.pageBg}" />`,
    `  <rect x="20" y="16" width="1000" height="66" rx="12" fill="${SVG_OKLCH.headerBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
    `  <text x="38" y="42" font-family="${FONT_SANS}" font-size="16" font-weight="700" fill="${SVG_OKLCH.inkPrimary}">${escapePigmentXml(title)}</text>`,
    `  <text x="38" y="64" font-family="${FONT_MONO}" font-size="11" fill="${SVG_OKLCH.inkSecondary}">${escapePigmentXml(subtitle)} · SHA-256 ${escapePigmentXml(hash.slice(0, 16))}</text>`,
    `  <rect x="786" y="30" width="216" height="36" rx="8" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="1.2" />`,
    `  <text x="894" y="53" text-anchor="middle" font-family="${FONT_SANS}" font-size="12" font-weight="700" fill="${badgeText}">${escapePigmentXml(badgeLabel)}</text>`,
    ...renderGradientStripPanel(comparison, 20, 98, 490, 212),
    ...renderSpectralCurvePanel(comparison, 530, 98, 490, 212),
    ...renderGlazingTripletPanel(glazingTriplet, 20, 328, 490, 250),
    ...renderBackrunPanel(backrun, 530, 328, 490, 250),
  ];

  const note =
    options?.artistNoteKo ??
    `안료 조합 ${comparison.pigmentANameKo} + ${comparison.pigmentBNameKo} | 매체 ${getWetMediumPreset(backrun.mediumPreset).nameKo} | 전체 안료 질량 오차 ${backrun.massConservationRelativeError.toExponential(2)}`;
  lines.push(
    `  <rect x="20" y="596" width="1000" height="64" rx="10" fill="${SVG_OKLCH.panelBg}" stroke="${SVG_OKLCH.borderSoft}" stroke-width="1" />`,
  );
  lines.push(
    `  <text x="38" y="622" font-family="${FONT_SANS}" font-size="11.5" font-weight="600" fill="${SVG_OKLCH.inkPrimary}">채색 감독 메모</text>`,
  );
  lines.push(
    `  <text x="38" y="644" font-family="${FONT_SANS}" font-size="11" fill="${SVG_OKLCH.inkSecondary}">${escapePigmentXml(note)}</text>`,
  );
  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * 스튜디오 채색 감독이 바로 검토할 수 있는 자연스러운 한국어 QA 브리프를 작성한다.
 */
export function summarizePigmentMixAuditKo(
  input: SummarizePigmentAuditInput,
): PigmentMixAuditReportKo {
  const { comparison, backrun, glazingTriplet, ksRoundTripMaxError, wgslValidation } = input;
  const medium = getWetMediumPreset(backrun.mediumPreset);
  const wcGlaze = glazingTriplet["watercolor-transparent"];
  const gouacheGlaze = glazingTriplet["gouache-opaque"];

  const recipeHash = computePigmentRecipeManifestHash({
    pigmentAId: comparison.pigmentAId,
    pigmentBId: comparison.pigmentBId,
    midpointRatioB: comparison.midpointRatioB,
    mediumPreset: backrun.mediumPreset,
    substrateId: backrun.substrateId,
    coatCount: wcGlaze.coats.length,
    tileWidth: backrun.width,
    tileHeight: backrun.height,
    simulationSteps: backrun.steps,
  });

  const ksAccurate = Number.isFinite(ksRoundTripMaxError) && ksRoundTripMaxError < 1e-6;
  const chromaSuperior = comparison.chromaAdvantage > 0.02;
  const massConserved =
    backrun.nonFiniteCount === 0 && backrun.massConservationRelativeError < 1e-6;
  const edgeOk =
    backrun.mediumPreset === "watercolor-transparent"
      ? backrun.edgeToInteriorRatio > 1.15 && backrun.edgeDarkerThanInterior
      : backrun.nonFiniteCount === 0;
  const glazingOk =
    wcGlaze.lightnessMonotonicDecreasing &&
    gouacheGlaze.finalHidingPower > wcGlaze.finalHidingPower;

  const checks: readonly PigmentAuditCheckItem[] = [
    {
      id: "ks-roundtrip",
      labelKo: "Kubelka-Munk K/S ↔ 반사율 왕복 정밀도",
      passed: ksAccurate,
      measuredText: ksRoundTripMaxError.toExponential(2),
      thresholdText: "< 1.00e-6",
      detailKo: ksAccurate
        ? "10개 파장 대역 전체에서 반사율 왕복 오차가 기준치 아래로 유지됩니다."
        : "K/S 왕복 변환 오차가 허용 한도를 넘겼습니다.",
    },
    {
      id: "subtractive-chroma",
      labelKo: "감산 혼색 채도 보존 (RGB 회색화 방지)",
      passed: chromaSuperior,
      measuredText: `KM C ${comparison.subtractiveMidpoint.oklch.c.toFixed(3)} / RGB C ${comparison.rgbLinearMidpointOklch.c.toFixed(3)}`,
      thresholdText: "KM 채도 우위 > +0.020",
      detailKo: comparison.isVividGreenMidpoint
        ? `중앙 혼색이 선명한 녹색(H ${comparison.subtractiveMidpoint.oklch.h.toFixed(1)}°)을 유지해 RGB 선형 보간 대비 채도가 +${comparison.chromaAdvantage.toFixed(3)} 높습니다.`
        : `RGB 선형 보간 대비 채도 차이는 ${comparison.chromaAdvantage >= 0 ? "+" : ""}${comparison.chromaAdvantage.toFixed(3)}입니다.`,
    },
    {
      id: "glazing-medium-separation",
      labelKo: "매체별 다층 글레이징 광학 분리",
      passed: glazingOk,
      measuredText: `과슈 은폐 ${(gouacheGlaze.finalHidingPower * 100).toFixed(1)}% vs 수채 ${(wcGlaze.finalHidingPower * 100).toFixed(1)}%`,
      thresholdText: "수채 명도 단조 감소 · 과슈 은폐 우위",
      detailKo: glazingOk
        ? "수채는 겹칠수록 종이 빛을 남기며 깊어지고, 과슈는 높은 산란으로 바탕을 안정적으로 덮습니다."
        : "수채 명도 감소 또는 과슈 은폐율 분리가 기준에 못 미칩니다.",
    },
    {
      id: "backrun-mass-conservation",
      labelKo: "모세관 엣지 다크닝 및 안료 질량 보존",
      passed: massConserved && edgeOk,
      measuredText: `테두리/내부 ${backrun.edgeToInteriorRatio.toFixed(2)}x · 질량 오차 ${backrun.massConservationRelativeError.toExponential(2)}`,
      thresholdText: "질량 오차 < 1.00e-6",
      detailKo:
        massConserved && edgeOk
          ? `${medium.nameKo} 타일에서 안료 유실 없이 접촉선 농도 분포가 물리 기준에 맞게 형성되었습니다.`
          : "모세관 번짐 질량 보존 또는 수채 테두리 농축 비율이 기준을 벗어났습니다.",
    },
    {
      id: "wgsl-validation",
      labelKo: "WebGPU WGSL 셰이더 구조·정렬 검증",
      passed: wgslValidation.valid,
      measuredText: `${String(wgslValidation.entryPoints.length)}개 진입점 · ${String(wgslValidation.bindingCount)}개 바인딩`,
      thresholdText: "오류 0건 · 16B 정렬",
      detailKo: wgslValidation.valid
        ? "16바이트 정렬 유니폼과 컴퓨트·프래그먼트 진입점이 모두 정상 검증되었습니다."
        : `WGSL 검증 오류 ${String(wgslValidation.errors.length)}건이 확인되었습니다.`,
    },
  ];

  const failedChecks = checks.filter((item) => !item.passed);
  const passed = failedChecks.length === 0;
  const grade: PigmentAuditGrade = passed
    ? "PASS"
    : failedChecks.length === 1 && !chromaSuperior
      ? "WARN"
      : "FAIL";

  const pigmentPairLabelKo = `${comparison.pigmentANameKo} + ${comparison.pigmentBNameKo}`;
  const dateSuffix = input.generatedDateIso ? ` (${input.generatedDateIso})` : "";
  const headlineKo = passed
    ? `[${grade}] ${pigmentPairLabelKo} 감산 안료 혼색·${medium.nameKo} 검증 통과${dateSuffix}`
    : `[${grade}] ${pigmentPairLabelKo} 채색 물리 기준 ${String(failedChecks.length)}건 점검 필요${dateSuffix}`;

  const summaryParagraphKo = passed
    ? `${pigmentPairLabelKo} 50:50 혼합에서 Kubelka-Munk 10-밴드 모델은 OKLCH 채도 ${comparison.subtractiveMidpoint.oklch.c.toFixed(3)}(색상각 ${comparison.subtractiveMidpoint.oklch.h.toFixed(1)}°)를 기록해 일반 RGB 선형 보간(${comparison.rgbLinearMidpointOklch.c.toFixed(3)})의 회색화 현상을 해소했습니다. ${medium.nameKo} 2D 타일은 질량 보존 오차 ${backrun.massConservationRelativeError.toExponential(2)}로 안정 수렴했습니다.`
    : `${pigmentPairLabelKo} 채색 검증에서 ${failedChecks.map((f) => f.labelKo).join(", ")} 항목이 기준을 충족하지 못했습니다. 해당 파라미터와 셰이더 구성을 확인한 뒤 다시 검증하세요.`;

  const bulletLinesKo: readonly string[] = checks.map(
    (c) => `[${c.passed ? "통과" : "보완"}] ${c.labelKo}: ${c.measuredText} (기준 ${c.thresholdText}) — ${c.detailKo}`,
  );

  return {
    grade,
    passed,
    recipeHash,
    pigmentPairLabelKo,
    mediumNameKo: medium.nameKo,
    headlineKo,
    summaryParagraphKo,
    bulletLinesKo,
    checks,
  };
}
