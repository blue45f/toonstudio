/**
 * Wave 156 — 배경 대비(`WCAG >= 4.5:1` · Björn Ottosson OKLab ΔE) 자동 다중 링 아웃라인
 * (Dual-Ring Halo: 내부 색테 + 외부 보호 할로) 솔버 및 순수 ES2017 동기 FIPS 180-4 SHA-256
 * 매니페스트 지문 생성기.
 *
 * - 단색·어두운 배경·밝은 배경·다색 혼재 액션 배경(흑+중간회색+백 동시 출현 포함)에서
 *   `fill ↔ innerOutline >= 4.5:1` AND 모든 배경 샘플에 대해 `innerOutline/outerHalo ↔ bg >= 4.5:1`
 *   이중 링 분리 가독성을 수학적으로 보장
 * - 단순 무아웃라인(No-Outline) 대비 최악 배경 대비비 개선 배수를 정량 산출
 * - 원시 hex/rgb/hsl 없이 순수 `oklch(...)` CSS 문자열 포매터 제공
 */

import { clampFinite, type CoonsPatchEnvelope } from "./sfx-coons-envelope-warp";

export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklabColor {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface OklchColor {
  readonly L: number;
  readonly C: number;
  readonly h: number;
}

export interface SfxOutlineSampleEvaluation {
  readonly sampleIndex: number;
  readonly backgroundSrgb: SrgbColor;
  readonly backgroundOklchCss: string;
  readonly noOutlineContrast: number;
  readonly noOutlineOklabDeltaE: number;
  readonly innerToBackgroundContrast: number;
  readonly outerToBackgroundContrast: number;
  readonly dualRingBestContrast: number;
  readonly dualRingBestOklabDeltaE: number;
  readonly dominatingRing: "inner" | "outer";
  readonly meetsWcagAa: boolean;
}

export interface SolveAdaptiveSfxOutlineInput {
  readonly fillSrgb: SrgbColor;
  readonly backgroundSamplesSrgb: readonly SrgbColor[];
  readonly baseFontSizePx?: number;
  readonly minContrastRatio?: number;
  readonly minOklabDeltaE?: number;
  readonly preferTintedOutline?: boolean;
  readonly forceDualRing?: boolean;
  readonly sfxText?: string;
  readonly presetId?: string;
}

export interface AdaptiveSfxOutlineSolution {
  readonly fillSrgb: SrgbColor;
  readonly fillOklchCss: string;
  readonly innerOutlineSrgb: SrgbColor;
  readonly innerOutlineOklchCss: string;
  readonly outerHaloSrgb: SrgbColor;
  readonly outerHaloOklchCss: string;
  readonly innerStrokePx: number;
  readonly outerHaloPx: number;
  readonly dropOffsetPx: number;
  readonly outlineActivated: boolean;
  readonly targetContrastRatio: number;
  readonly targetOklabDeltaE: number;
  readonly fillToInnerContrast: number;
  readonly fillToInnerOklabDeltaE: number;
  readonly innerToOuterContrast: number;
  readonly innerToOuterOklabDeltaE: number;
  readonly worstNoOutlineContrast: number;
  readonly worstNoOutlineOklabDeltaE: number;
  readonly worstDualRingBackgroundContrast: number;
  readonly worstOuterOnlyBackgroundContrast: number;
  readonly worstDualRingOklabDeltaE: number;
  readonly effectiveWorstContrast: number;
  readonly contrastImprovementMultiplier: number;
  readonly meetsDualRingReadability: boolean;
  readonly sampleEvaluations: readonly SfxOutlineSampleEvaluation[];
  readonly sfxManifestSha256Hex: string;
  readonly manifestCanonicalJson: string;
}

export interface SfxManifestFingerprintInput {
  readonly text: string;
  readonly presetId: string;
  readonly envelope?: CoonsPatchEnvelope;
  readonly outline: AdaptiveSfxOutlineSolution;
}

export interface SfxManifestFingerprint {
  readonly version: "wave156-v1";
  readonly sfxManifestSha256Hex: string;
  readonly manifestCanonicalJson: string;
}

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

/** sRGB 채널을 `[0, 1]` 범위의 유한수로 정규화한다. */
export function clampSrgb(color: SrgbColor): SrgbColor {
  return {
    r: clampFinite(color.r, 0, 1, 0),
    g: clampFinite(color.g, 0, 1, 0),
    b: clampFinite(color.b, 0, 1, 0),
  };
}

/** IEC 61966-2-1 sRGB 채널을 선형광(Linear RGB)으로 변환한다. */
export function srgbChannelToLinear(channelIn: number): number {
  const c = clampFinite(channelIn, 0, 1, 0);
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 선형광(Linear RGB) 채널을 sRGB로 변환한다. */
export function linearToSrgbChannel(channelIn: number): number {
  const c = clampFinite(channelIn, 0, 1, 0);
  if (c <= 0.0031308) {
    return 12.92 * c;
  }
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** WCAG 2.1 상대휘도(Relative Luminance, `0.0 ~ 1.0`)를 계산한다. */
export function computeRelativeLuminance(color: SrgbColor): number {
  const safe = clampSrgb(color);
  const lr = srgbChannelToLinear(safe.r);
  const lg = srgbChannelToLinear(safe.g);
  const lb = srgbChannelToLinear(safe.b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2.1 명암비(`1.0 ~ 21.0`)를 계산한다. */
export function computeWcagContrastRatio(a: SrgbColor, b: SrgbColor): number {
  const la = computeRelativeLuminance(a);
  const lb = computeRelativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** sRGB를 Björn Ottosson 정본 OKLab 색공간으로 변환한다. */
export function srgbToOklab(color: SrgbColor): OklabColor {
  const safe = clampSrgb(color);
  const lr = srgbChannelToLinear(safe.r);
  const lg = srgbChannelToLinear(safe.g);
  const lb = srgbChannelToLinear(safe.b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const lCbrt = Math.cbrt(Math.max(0, l));
  const mCbrt = Math.cbrt(Math.max(0, m));
  const sCbrt = Math.cbrt(Math.max(0, s));

  return {
    L: 0.2104542553 * lCbrt + 0.7936177850 * mCbrt - 0.0040720468 * sCbrt,
    a: 1.9779984951 * lCbrt - 2.4285922050 * mCbrt + 0.4505937099 * sCbrt,
    b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.8086757660 * sCbrt,
  };
}

/** Björn Ottosson OKLab 색상을 sRGB `[0, 1]`로 역변환한다. */
export function oklabToSrgb(lab: OklabColor): SrgbColor {
  const lCbrt = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mCbrt = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sCbrt = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;

  const l = lCbrt * lCbrt * lCbrt;
  const m = mCbrt * mCbrt * mCbrt;
  const s = sCbrt * sCbrt * sCbrt;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return {
    r: linearToSrgbChannel(lr),
    g: linearToSrgbChannel(lg),
    b: linearToSrgbChannel(lb),
  };
}

/** OKLab 좌표를 극좌표 OKLCH(`L`, `C`, `h[deg]`)로 변환한다. */
export function oklabToOklch(lab: OklabColor): OklchColor {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return {
    L: clampFinite(lab.L, 0, 1, 0),
    C: Math.max(0, Number.isFinite(C) ? C : 0),
    h: C < 1e-6 ? 0 : h,
  };
}

/** sRGB를 OKLCH로 변환한다. */
export function srgbToOklch(color: SrgbColor): OklchColor {
  return oklabToOklch(srgbToOklab(color));
}

/** 두 sRGB 색상 사이의 Björn Ottosson OKLab 유클리드 색차(ΔE)를 계산한다. */
export function computeOklabDeltaE(a: SrgbColor, b: SrgbColor): number {
  const labA = srgbToOklab(a);
  const labB = srgbToOklab(b);
  return Math.hypot(labA.L - labB.L, labA.a - labB.a, labA.b - labB.b);
}

/** OKLCH 색상을 순수 CSS `oklch(...)` 문자열로 포맷한다. */
export function formatOklchCss(oklch: OklchColor, alpha?: number): string {
  const L = clampFinite(oklch.L, 0, 1, 0).toFixed(4);
  const C = clampFinite(oklch.C, 0, 0.5, 0).toFixed(4);
  const h = (((Number.isFinite(oklch.h) ? oklch.h : 0) % 360) + 360) % 360;
  const hText = h.toFixed(1);
  if (alpha !== undefined && alpha < 0.9999) {
    const aText = clampFinite(alpha, 0, 1, 1).toFixed(3);
    return `oklch(${L} ${C} ${hText} / ${aText})`;
  }
  return `oklch(${L} ${C} ${hText})`;
}

/** sRGB 색상을 원시 hex/rgb 없이 순수 `oklch(...)` CSS 문자열로 변환한다. */
export function formatSrgbAsOklchCss(color: SrgbColor, alpha?: number): string {
  return formatOklchCss(srgbToOklch(color), alpha);
}

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 외부 암호 라이브러리·BigInt 리터럴 없는 순수 ES2017 동기 FIPS 180-4 SHA-256 해시. */
export function sha256SfxHex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLength = raw.length;
  const paddedLength = Math.ceil((byteLength + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(raw, 0);
  buffer[byteLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
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
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

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

  return (
    uint32ToHex(h0) +
    uint32ToHex(h1) +
    uint32ToHex(h2) +
    uint32ToHex(h3) +
    uint32ToHex(h4) +
    uint32ToHex(h5) +
    uint32ToHex(h6) +
    uint32ToHex(h7)
  );
}

/** 객체 키를 사전순으로 정규화해 플랫폼 독립적인 결정론 JSON 문자열을 만든다. */
export function canonicalizeSfxJson(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) return "null";
    const normalized = Math.abs(num) < 1e-12 ? 0 : Math.round(num * 1e6) / 1e6;
    return Object.is(normalized, -0) ? "0" : JSON.stringify(normalized);
  }
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      parts.push(value[i] === undefined ? "null" : canonicalizeSfxJson(value[i]));
    }
    return `[${parts.join(",")}]`;
  }
  if (t === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (rec[k] !== undefined) {
        parts.push(`${JSON.stringify(k)}:${canonicalizeSfxJson(rec[k])}`);
      }
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}

interface OutlineCandidate {
  readonly color: SrgbColor;
  readonly tinted: boolean;
}

function buildOutlineCandidates(fill: SrgbColor): readonly OutlineCandidate[] {
  const fillLch = srgbToOklch(fill);
  const fillHueRad = (fillLch.h * Math.PI) / 180;
  const compHueRad = (((fillLch.h + 180) % 360) * Math.PI) / 180;
  const makeOklchSrgb = (L: number, C: number, rad: number): SrgbColor =>
    oklabToSrgb({ L, a: C * Math.cos(rad), b: C * Math.sin(rad) });

  return [
    // 초고대비 극단 잉크·순백 (다색 혼재 배경에서도 sqrt(21)=4.58:1 수학적 보장)
    { color: { r: 0.002, g: 0.002, b: 0.004 }, tinted: false },
    { color: { r: 0.999, g: 0.999, b: 0.999 }, tinted: false },
    // 스튜디오 먹색·종이 미백
    { color: { r: 0.035, g: 0.038, b: 0.048 }, tinted: false },
    { color: { r: 0.975, g: 0.970, b: 0.955 }, tinted: false },
    // 본문 색상과 조화되는 딥 틴트 잉크·소프트 틴트 할로
    { color: makeOklchSrgb(0.14, 0.045, fillHueRad), tinted: true },
    { color: makeOklchSrgb(0.16, 0.055, compHueRad), tinted: true },
    { color: makeOklchSrgb(0.965, 0.025, fillHueRad), tinted: true },
    { color: makeOklchSrgb(0.955, 0.032, compHueRad), tinted: true },
    // 만화 강조 크로마틱 아웃라인(짙은 군청·크림 골드)
    { color: { r: 0.055, g: 0.075, b: 0.165 }, tinted: true },
    { color: { r: 0.992, g: 0.945, b: 0.720 }, tinted: true },
  ];
}

/**
 * 배경 샘플들(단색 또는 흑·중간톤·백이 섞인 복잡 액션 배경) 위에서 SFX 본문 채움색의
 * 가독성을 분석하고, `WCAG < 4.5:1`인 샘플이 하나라도 있으면
 * 최적 대비 내부 아웃라인(`innerOutlineSrgb`) + 외부 보호 할로(`outerHaloSrgb`)를 자동 산출한다.
 */
export function solveAdaptiveSfxOutline(
  input: SolveAdaptiveSfxOutlineInput,
): AdaptiveSfxOutlineSolution {
  const fill = clampSrgb(input.fillSrgb);
  const bgSamples: readonly SrgbColor[] =
    input.backgroundSamplesSrgb.length > 0
      ? input.backgroundSamplesSrgb.map(clampSrgb)
      : [{ r: 0.5, g: 0.5, b: 0.5 }];

  const baseFontSizePx = clampFinite(input.baseFontSizePx ?? 96, 16, 512, 96);
  const targetContrast = clampFinite(input.minContrastRatio ?? 4.5, 3.0, 12.0, 4.5);
  const targetDeltaE = clampFinite(input.minOklabDeltaE ?? 0.24, 0.05, 0.8, 0.24);
  const preferTinted = input.preferTintedOutline !== false;

  // 1. 무아웃라인(No-Outline) 기준 최악 배경 대비 및 배경 휘도 분산 측정
  let worstNoOutlineContrast = Number.POSITIVE_INFINITY;
  let worstNoOutlineDeltaE = Number.POSITIVE_INFINITY;
  let minBgLum = 1;
  let maxBgLum = 0;

  for (let i = 0; i < bgSamples.length; i += 1) {
    const bg = bgSamples[i];
    const cr = computeWcagContrastRatio(fill, bg);
    const de = computeOklabDeltaE(fill, bg);
    const lum = computeRelativeLuminance(bg);
    if (cr < worstNoOutlineContrast) worstNoOutlineContrast = cr;
    if (de < worstNoOutlineDeltaE) worstNoOutlineDeltaE = de;
    if (lum < minBgLum) minBgLum = lum;
    if (lum > maxBgLum) maxBgLum = lum;
  }

  const bgLuminanceSpan = Math.max(0, maxBgLum - minBgLum);
  const needsOutline =
    Boolean(input.forceDualRing) ||
    worstNoOutlineContrast < targetContrast ||
    worstNoOutlineDeltaE < targetDeltaE;

  // 2. 이중 링(innerOutline + outerHalo) 후보 조합 탐색
  const candidates = buildOutlineCandidates(fill);
  let bestInner: SrgbColor = { r: 0.002, g: 0.002, b: 0.004 };
  let bestOuter: SrgbColor = { r: 0.999, g: 0.999, b: 0.999 };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < candidates.length; i += 1) {
    const innerCand = candidates[i];
    const fillInnerCr = computeWcagContrastRatio(fill, innerCand.color);
    const fillInnerDe = computeOklabDeltaE(fill, innerCand.color);

    for (let j = 0; j < candidates.length; j += 1) {
      if (i === j) continue;
      const outerCand = candidates[j];
      const innerOuterCr = computeWcagContrastRatio(innerCand.color, outerCand.color);
      const innerOuterDe = computeOklabDeltaE(innerCand.color, outerCand.color);

      let worstDualBgCr = Number.POSITIVE_INFINITY;
      let worstOuterOnlyBgCr = Number.POSITIVE_INFINITY;
      let worstDualBgDe = Number.POSITIVE_INFINITY;

      for (let b = 0; b < bgSamples.length; b += 1) {
        const bg = bgSamples[b];
        const innerBgCr = computeWcagContrastRatio(innerCand.color, bg);
        const outerBgCr = computeWcagContrastRatio(outerCand.color, bg);
        const dualCr = Math.max(innerBgCr, outerBgCr);
        const dualDe = Math.max(
          computeOklabDeltaE(innerCand.color, bg),
          computeOklabDeltaE(outerCand.color, bg),
        );
        if (dualCr < worstDualBgCr) worstDualBgCr = dualCr;
        if (outerBgCr < worstOuterOnlyBgCr) worstOuterOnlyBgCr = outerBgCr;
        if (dualDe < worstDualBgDe) worstDualBgDe = dualDe;
      }

      const hardPass =
        fillInnerCr >= targetContrast &&
        innerOuterCr >= targetContrast &&
        worstDualBgCr >= targetContrast;
      const outerSoloPass = worstOuterOnlyBgCr >= targetContrast;
      const deltaEPass = fillInnerDe >= targetDeltaE && worstDualBgDe >= targetDeltaE;

      // 점수화: 하드 기준 통과 최우선 -> 외부 할로 단독 전수 분리 보너스 -> 최소 대비·OKLab ΔE 최대화
      const minEffectiveCr = Math.min(fillInnerCr, innerOuterCr, worstDualBgCr);
      const tintBonus =
        preferTinted && hardPass
          ? (innerCand.tinted ? 0.65 : 0) + (outerCand.tinted ? 0.45 : 0)
          : 0;

      const score =
        (hardPass ? 1000 : 0) +
        (outerSoloPass ? 120 : 0) +
        (deltaEPass ? 60 : 0) +
        minEffectiveCr * 8.0 +
        Math.min(worstOuterOnlyBgCr, 15.0) * 1.6 +
        Math.min(fillInnerDe, 1.0) * 12.0 +
        Math.min(worstDualBgDe, 1.0) * 12.0 +
        Math.min(innerOuterDe, 1.0) * 4.0 +
        tintBonus;

      if (score > bestScore) {
        bestScore = score;
        bestInner = innerCand.color;
        bestOuter = outerCand.color;
      }
    }
  }

  // 3. 최종 선택된 이중 링에 대한 배경 샘플별 정밀 감사
  const fillToInnerContrast = computeWcagContrastRatio(fill, bestInner);
  const fillToInnerOklabDeltaE = computeOklabDeltaE(fill, bestInner);
  const innerToOuterContrast = computeWcagContrastRatio(bestInner, bestOuter);
  const innerToOuterOklabDeltaE = computeOklabDeltaE(bestInner, bestOuter);

  const sampleEvaluations: SfxOutlineSampleEvaluation[] = [];
  let worstDualRingBackgroundContrast = Number.POSITIVE_INFINITY;
  let worstOuterOnlyBackgroundContrast = Number.POSITIVE_INFINITY;
  let worstDualRingOklabDeltaE = Number.POSITIVE_INFINITY;

  for (let i = 0; i < bgSamples.length; i += 1) {
    const bg = bgSamples[i];
    const noOutlineContrast = computeWcagContrastRatio(fill, bg);
    const noOutlineOklabDeltaE = computeOklabDeltaE(fill, bg);
    const innerToBackgroundContrast = computeWcagContrastRatio(bestInner, bg);
    const outerToBackgroundContrast = computeWcagContrastRatio(bestOuter, bg);
    const dominatingRing: "inner" | "outer" =
      outerToBackgroundContrast >= innerToBackgroundContrast ? "outer" : "inner";
    const dualRingBestContrast = Math.max(
      innerToBackgroundContrast,
      outerToBackgroundContrast,
    );
    const dualRingBestOklabDeltaE = Math.max(
      computeOklabDeltaE(bestInner, bg),
      computeOklabDeltaE(bestOuter, bg),
    );

    if (dualRingBestContrast < worstDualRingBackgroundContrast) {
      worstDualRingBackgroundContrast = dualRingBestContrast;
    }
    if (outerToBackgroundContrast < worstOuterOnlyBackgroundContrast) {
      worstOuterOnlyBackgroundContrast = outerToBackgroundContrast;
    }
    if (dualRingBestOklabDeltaE < worstDualRingOklabDeltaE) {
      worstDualRingOklabDeltaE = dualRingBestOklabDeltaE;
    }

    sampleEvaluations.push({
      sampleIndex: i,
      backgroundSrgb: bg,
      backgroundOklchCss: formatSrgbAsOklchCss(bg),
      noOutlineContrast,
      noOutlineOklabDeltaE,
      innerToBackgroundContrast,
      outerToBackgroundContrast,
      dualRingBestContrast,
      dualRingBestOklabDeltaE,
      dominatingRing,
      meetsWcagAa: dualRingBestContrast >= targetContrast,
    });
  }

  // 4. 아웃라인 두께(내부 색테 + 외부 보호 할로 + 드롭 오프셋) 산출
  const contrastDeficit = clampFinite(
    (targetContrast - worstNoOutlineContrast) / targetContrast,
    0,
    1,
    0,
  );
  const innerStrokePx = needsOutline
    ? Math.round(clampFinite(baseFontSizePx * (0.048 + 0.032 * contrastDeficit), 3.0, 16.0) * 10) / 10
    : 0;
  const outerHaloPx = needsOutline
    ? Math.round(
        clampFinite(
          baseFontSizePx * (0.056 + 0.028 * contrastDeficit + 0.026 * bgLuminanceSpan),
          4.0,
          20.0,
        ) * 10,
      ) / 10
    : 0;
  const dropOffsetPx = needsOutline
    ? Math.round(clampFinite(baseFontSizePx * 0.042, 2.0, 10.0) * 10) / 10
    : 0;

  const effectiveWorstContrast = needsOutline
    ? Math.min(fillToInnerContrast, worstDualRingBackgroundContrast)
    : worstNoOutlineContrast;
  const contrastImprovementMultiplier = needsOutline
    ? worstDualRingBackgroundContrast / Math.max(1.0, worstNoOutlineContrast)
    : 1.0;

  const meetsDualRingReadability =
    fillToInnerContrast >= targetContrast &&
    worstDualRingBackgroundContrast >= targetContrast &&
    (needsOutline ? innerToOuterContrast >= targetContrast : worstNoOutlineContrast >= targetContrast);

  const manifestPayload = {
    version: "wave156-outline-v1",
    sfxText: input.sfxText ?? "",
    presetId: input.presetId ?? "default",
    fill,
    backgroundSamples: bgSamples,
    innerOutline: bestInner,
    outerHalo: bestOuter,
    innerStrokePx,
    outerHaloPx,
    dropOffsetPx,
    outlineActivated: needsOutline,
    targetContrast,
  };
  const manifestCanonicalJson = canonicalizeSfxJson(manifestPayload);
  const sfxManifestSha256Hex = sha256SfxHex(manifestCanonicalJson);

  return {
    fillSrgb: fill,
    fillOklchCss: formatSrgbAsOklchCss(fill),
    innerOutlineSrgb: bestInner,
    innerOutlineOklchCss: formatSrgbAsOklchCss(bestInner),
    outerHaloSrgb: bestOuter,
    outerHaloOklchCss: formatSrgbAsOklchCss(bestOuter),
    innerStrokePx,
    outerHaloPx,
    dropOffsetPx,
    outlineActivated: needsOutline,
    targetContrastRatio: targetContrast,
    targetOklabDeltaE: targetDeltaE,
    fillToInnerContrast,
    fillToInnerOklabDeltaE,
    innerToOuterContrast,
    innerToOuterOklabDeltaE,
    worstNoOutlineContrast,
    worstNoOutlineOklabDeltaE: worstNoOutlineDeltaE,
    worstDualRingBackgroundContrast,
    worstOuterOnlyBackgroundContrast,
    worstDualRingOklabDeltaE,
    effectiveWorstContrast,
    contrastImprovementMultiplier,
    meetsDualRingReadability,
    sampleEvaluations,
    sfxManifestSha256Hex,
    manifestCanonicalJson,
  };
}

/** SFX 텍스트·Coons 엔벨로프·이중 링 아웃라인을 묶은 통합 FIPS 180-4 SHA-256 매니페스트 지문을 생성한다. */
export function computeSfxManifestFingerprint(
  input: SfxManifestFingerprintInput,
): SfxManifestFingerprint {
  const payload = {
    version: "wave156-v1",
    text: input.text,
    presetId: input.presetId,
    envelope: input.envelope ?? null,
    outline: {
      fill: input.outline.fillSrgb,
      innerOutline: input.outline.innerOutlineSrgb,
      outerHalo: input.outline.outerHaloSrgb,
      innerStrokePx: input.outline.innerStrokePx,
      outerHaloPx: input.outline.outerHaloPx,
      dropOffsetPx: input.outline.dropOffsetPx,
      outlineActivated: input.outline.outlineActivated,
      worstDualRingBackgroundContrast: input.outline.worstDualRingBackgroundContrast,
    },
  };
  const manifestCanonicalJson = canonicalizeSfxJson(payload);
  return {
    version: "wave156-v1",
    sfxManifestSha256Hex: sha256SfxHex(manifestCanonicalJson),
    manifestCanonicalJson,
  };
}
