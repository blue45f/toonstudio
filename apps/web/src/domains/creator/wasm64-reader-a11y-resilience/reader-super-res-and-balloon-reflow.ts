/**
 * WebGPU 2× 엣지 방향성 초해상도(`WGSL_READER_SUPER_RES_2X` + CPU 패리티) 및
 * 글로벌 다국어 말풍선 자동 조판·금칙(Kinsoku) 처리 엔진.
 *
 * - `WGSL_READER_SUPER_RES_2X` / `upscaleImage2xEdgeDirectedCpu`:
 *   대각선 휘도 기울기 기반 방향성 보간 + 국소 최소·최대 클램핑으로 웹툰 선화 링잉을 차단한다.
 * - `reflowBalloonTextForLocale`:
 *   AI 토큰 0개로 `ko`/`en`/`ja`/`zh-Hans`/`zh-Hant` 가로(`htb`)·세로(`ttb`) 말풍선 안전 여백 내
 *   이진 탐색 최적 폰트 크기 산출 및 행두·행말 금칙(Kinsoku)을 강제한다.
 */

export const SUPER_RES_2X_WORKGROUP_X = 16 as const;
export const SUPER_RES_2X_WORKGROUP_Y = 16 as const;
export const SUPER_RES_2X_UNIFORM_BYTES = 32 as const;

export type ReaderLocale = "ko" | "en" | "ja" | "zh-Hans" | "zh-Hant";
export type BalloonWritingMode = "htb" | "ttb";
export type BalloonShapeKind = "ellipse" | "rect" | "cloud";
export type BalloonReadabilityGrade = "optimal" | "tight" | "cramped" | "overflow";

export interface SuperRes2xConfig {
  readonly width: number;
  readonly height: number;
  readonly edgeThreshold?: number;
  readonly edgeSteeringStrength?: number;
  readonly sharpenStrength?: number;
}

export interface PackedSuperRes2xUniforms {
  readonly buffer: ArrayBuffer;
  readonly u32View: Uint32Array;
  readonly f32View: Float32Array;
  readonly byteLength: typeof SUPER_RES_2X_UNIFORM_BYTES;
  readonly width: number;
  readonly height: number;
  readonly outWidth: number;
  readonly outHeight: number;
  readonly edgeThreshold: number;
  readonly edgeSteeringStrength: number;
  readonly sharpenStrength: number;
}

export interface SuperRes2xWorkgroupGrid {
  readonly x: number;
  readonly y: number;
  readonly z: 1;
  readonly workgroupSize: readonly [16, 16, 1];
  readonly totalWorkgroups: number;
}

export interface SuperRes2xWgslValidation {
  readonly valid: boolean;
  readonly entryPoint: string | null;
  readonly workgroupSize: readonly [number, number, number] | null;
  readonly bindings: readonly { readonly group: number; readonly binding: number }[];
  readonly errors: readonly string[];
}

export interface SuperRes2xPipelineDescriptor {
  readonly label: string;
  readonly layout: "auto";
  readonly compute: {
    readonly module: { readonly label?: string };
    readonly entryPoint: "main";
  };
}

export interface SuperRes2xCpuResult {
  readonly backend: "cpu-fallback";
  readonly srcWidth: number;
  readonly srcHeight: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly uniforms: PackedSuperRes2xUniforms;
  readonly directedEdgePixelCount: number;
  readonly averageEdgeContrast: number;
}

export interface BalloonReflowInput {
  readonly text: string;
  readonly locale: ReaderLocale;
  readonly shape: BalloonShapeKind;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly writingMode?: BalloonWritingMode;
  readonly safeInsetRatio?: number;
  readonly safeInsetPx?: number;
  readonly minFontSizePx?: number;
  readonly maxFontSizePx?: number;
  readonly lineHeightMultiplier?: number;
  readonly letterSpacingEm?: number;
}

export interface PlacedBalloonLine {
  readonly index: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly advancePx: number;
  readonly maxAvailablePx: number;
  readonly utilization: number;
}

export interface BalloonReflowResult {
  readonly locale: ReaderLocale;
  readonly writingMode: BalloonWritingMode;
  readonly shape: BalloonShapeKind;
  readonly fittedFontSizePx: number;
  readonly lineAdvancePx: number;
  readonly lines: readonly PlacedBalloonLine[];
  readonly lineCount: number;
  readonly overflow: boolean;
  readonly overflowRatio: number;
  readonly fillRatio: number;
  readonly kinsokuViolationCount: number;
  readonly readabilityGrade: BalloonReadabilityGrade;
  readonly remediationHints: readonly string[];
}

/**
 * WebGPU `@workgroup_size(16, 16)` 2× 엣지 방향성 초해상도 컴퓨트 셰이더.
 */
export const WGSL_READER_SUPER_RES_2X = /* wgsl */ `
struct SuperResUniforms {
  srcWidth: u32,
  srcHeight: u32,
  outWidth: u32,
  outHeight: u32,
  edgeThreshold: f32,
  edgeSteeringStrength: f32,
  sharpenStrength: f32,
  _pad0: f32,
};

@group(0) @binding(0) var<uniform> params: SuperResUniforms;
@group(0) @binding(1) var<storage, read> srcPixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dstPixels: array<u32>;

fn unpackRgba8(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 255u) / 255.0,
    f32((packed >> 8u) & 255u) / 255.0,
    f32((packed >> 16u) & 255u) / 255.0,
    f32((packed >> 24u) & 255u) / 255.0
  );
}

fn packRgba8(c: vec4<f32>) -> u32 {
  let r = u32(round(clamp(c.r, 0.0, 1.0) * 255.0));
  let g = u32(round(clamp(c.g, 0.0, 1.0) * 255.0));
  let b = u32(round(clamp(c.b, 0.0, 1.0) * 255.0));
  let a = u32(round(clamp(c.a, 0.0, 1.0) * 255.0));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

fn loadClamped(x: i32, y: i32) -> vec4<f32> {
  let cx = u32(clamp(x, 0, i32(params.srcWidth) - 1));
  let cy = u32(clamp(y, 0, i32(params.srcHeight) - 1));
  return unpackRgba8(srcPixels[cy * params.srcWidth + cx]);
}

fn luma(c: vec4<f32>) -> f32 {
  return dot(c.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.outWidth || gid.y >= params.outHeight) {
    return;
  }
  let sx = (f32(gid.x) + 0.5) * 0.5 - 0.5;
  let sy = (f32(gid.y) + 0.5) * 0.5 - 0.5;
  let ix = i32(floor(sx));
  let iy = i32(floor(sy));
  let fx = sx - f32(ix);
  let fy = sy - f32(iy);

  let p00 = loadClamped(ix, iy);
  let p10 = loadClamped(ix + 1, iy);
  let p01 = loadClamped(ix, iy + 1);
  let p11 = loadClamped(ix + 1, iy + 1);

  let bilerp = mix(mix(p00, p10, fx), mix(p01, p11, fx), fy);
  let gd1 = abs(luma(p11) - luma(p00));
  let gd2 = abs(luma(p10) - luma(p01));
  let eps = 0.002;
  let aniso = abs(gd1 - gd2) / (gd1 + gd2 + eps);

  var est = bilerp;
  if (aniso > params.edgeThreshold) {
    let w1 = 1.0 / (gd1 + eps);
    let w2 = 1.0 / (gd2 + eps);
    let d1 = mix(p00, p11, 0.5 * (fx + fy));
    let d2 = mix(p10, p01, 0.5 * ((1.0 - fx) + fy));
    let dirEst = (w1 * d1 + w2 * d2) / (w1 + w2);
    let blend = clamp((aniso - params.edgeThreshold) / max(1.0 - params.edgeThreshold, 0.05), 0.0, 1.0)
      * params.edgeSteeringStrength;
    est = mix(bilerp, dirEst, blend);
  }

  let localMean = 0.25 * (p00 + p10 + p01 + p11);
  let minBound = min(min(p00, p10), min(p01, p11));
  let maxBound = max(max(p00, p10), max(p01, p11));
  let sharpened = clamp(est + (est - localMean) * params.sharpenStrength, minBound, maxBound);
  dstPixels[gid.y * params.outWidth + gid.x] = packRgba8(vec4<f32>(sharpened.rgb, bilerp.a));
}
`;

// 한국어·일본어·중국어 행두 금칙 문자(줄 시작 금지)
const KINSOKU_NO_START_CHARS = new Set<string>([
  ".", ",", "!", "?", ";", ":", ")", "]", "}", "”", "’",
  "」", "』", "】", "〉", "》", "〕", "、", "。", "！", "？",
  "・", "ー", "…", "—", "~", "%", "％", "ぁ", "ぃ", "ぅ", "ぇ",
  "ぉ", "っ", "ゃ", "ゅ", "ょ", "ゎ", "ァ", "ィ", "ゥ", "ェ",
  "ォ", "ッ", "ャ", "ュ", "ョ", "ヮ", "々", "〻", "ヽ", "ヾ",
]);

// 행말 금칙 문자(줄 끝 금지)
const KINSOKU_NO_END_CHARS = new Set<string>([
  "(", "[", "{", "“", "‘", "「", "『", "【", "〈", "《", "〔", "₩", "$", "¥", "@", "#",
]);

const NARROW_LATIN_CHARS = new Set<string>(["i", "l", "I", "j", "t", "f", "r", "1", ".", ",", ":", ";", "!", "'", "|"]);
const WIDE_LATIN_CHARS = new Set<string>(["W", "M", "w", "m", "@", "%", "&"]);

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function packSuperRes2xUniforms(config: SuperRes2xConfig): PackedSuperRes2xUniforms {
  const width = Math.max(1, Math.floor(config.width));
  const height = Math.max(1, Math.floor(config.height));
  const outWidth = width * 2;
  const outHeight = height * 2;
  const edgeThreshold = clampNumber(config.edgeThreshold ?? 0.08, 0.01, 0.9);
  const edgeSteeringStrength = clampNumber(config.edgeSteeringStrength ?? 0.85, 0, 1);
  const sharpenStrength = clampNumber(config.sharpenStrength ?? 0.35, 0, 1.5);

  const buffer = new ArrayBuffer(SUPER_RES_2X_UNIFORM_BYTES);
  const u32View = new Uint32Array(buffer);
  const f32View = new Float32Array(buffer);
  u32View[0] = width;
  u32View[1] = height;
  u32View[2] = outWidth;
  u32View[3] = outHeight;
  f32View[4] = edgeThreshold;
  f32View[5] = edgeSteeringStrength;
  f32View[6] = sharpenStrength;
  f32View[7] = 0;

  return {
    buffer,
    u32View,
    f32View,
    byteLength: SUPER_RES_2X_UNIFORM_BYTES,
    width,
    height,
    outWidth,
    outHeight,
    edgeThreshold,
    edgeSteeringStrength,
    sharpenStrength,
  };
}

export function computeSuperRes2xWorkgroups(outWidth: number, outHeight: number): SuperRes2xWorkgroupGrid {
  const x = Math.ceil(Math.max(1, Math.floor(outWidth)) / SUPER_RES_2X_WORKGROUP_X);
  const y = Math.ceil(Math.max(1, Math.floor(outHeight)) / SUPER_RES_2X_WORKGROUP_Y);
  return {
    x,
    y,
    z: 1,
    workgroupSize: [SUPER_RES_2X_WORKGROUP_X, SUPER_RES_2X_WORKGROUP_Y, 1],
    totalWorkgroups: x * y,
  };
}

export function createSuperRes2xPipelineDescriptor(
  shaderModule: { readonly label?: string },
  label = "toonstudio-reader-super-res-2x",
): SuperRes2xPipelineDescriptor {
  return { label, layout: "auto", compute: { module: shaderModule, entryPoint: "main" } };
}

export function validateSuperRes2xWgsl(source: string = WGSL_READER_SUPER_RES_2X): SuperRes2xWgslValidation {
  const errors: string[] = [];
  const wgMatch = /@workgroup_size\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(source);
  const fnMatch = /@compute[\s\S]*?fn\s+([A-Za-z_]\w*)\s*\(/.exec(source);
  const bindings = [...source.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)/g)].map((m) => ({
    group: Number(m[1]),
    binding: Number(m[2]),
  }));

  if (!wgMatch) errors.push("누락된 @workgroup_size 선언");
  if (!fnMatch) errors.push("누락된 @compute 진입점");
  if (bindings.length < 3) errors.push("바인딩 3개(uniform, srcPixels, dstPixels) 필요");

  return {
    valid: errors.length === 0,
    entryPoint: fnMatch?.[1] ?? null,
    workgroupSize: wgMatch ? [Number(wgMatch[1]), Number(wgMatch[2]), Number(wgMatch[3])] : null,
    bindings,
    errors,
  };
}

function sampleRgbaClamped(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
  const idx = (cy * width + cx) * 4;
  return [
    (rgba[idx] ?? 0) / 255,
    (rgba[idx + 1] ?? 0) / 255,
    (rgba[idx + 2] ?? 0) / 255,
    (rgba[idx + 3] ?? 255) / 255,
  ];
}

function lumaRgb(c: readonly [number, number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * `WGSL_READER_SUPER_RES_2X`와 동일한 수식으로 RGBA8 이미지를 2× 엣지 방향성 초해상도 업스케일한다.
 */
export function upscaleImage2xEdgeDirectedCpu(
  srcRgba: Uint8ClampedArray | Uint8Array,
  config: SuperRes2xConfig,
): SuperRes2xCpuResult {
  const uniforms = packSuperRes2xUniforms(config);
  const { width: srcWidth, height: srcHeight, outWidth, outHeight } = uniforms;
  const expectedLength = srcWidth * srcHeight * 4;
  if (srcRgba.length < expectedLength) {
    throw new RangeError(`초해상도 입력 버퍼 크기 부족: 필요 ${expectedLength}, 실제 ${srcRgba.length}`);
  }

  const dst = new Uint8ClampedArray(outWidth * outHeight * 4);
  const eps = 0.002;
  let directedEdgePixelCount = 0;
  let contrastSum = 0;

  for (let oy = 0; oy < outHeight; oy += 1) {
    const sy = (oy + 0.5) * 0.5 - 0.5;
    const iy = Math.floor(sy);
    const fy = sy - iy;

    for (let ox = 0; ox < outWidth; ox += 1) {
      const sx = (ox + 0.5) * 0.5 - 0.5;
      const ix = Math.floor(sx);
      const fx = sx - ix;

      const p00 = sampleRgbaClamped(srcRgba, srcWidth, srcHeight, ix, iy);
      const p10 = sampleRgbaClamped(srcRgba, srcWidth, srcHeight, ix + 1, iy);
      const p01 = sampleRgbaClamped(srcRgba, srcWidth, srcHeight, ix, iy + 1);
      const p11 = sampleRgbaClamped(srcRgba, srcWidth, srcHeight, ix + 1, iy + 1);

      const gd1 = Math.abs(lumaRgb(p11) - lumaRgb(p00));
      const gd2 = Math.abs(lumaRgb(p10) - lumaRgb(p01));
      const aniso = Math.abs(gd1 - gd2) / (gd1 + gd2 + eps);
      contrastSum += Math.max(gd1, gd2);

      const useDirected = aniso > uniforms.edgeThreshold;
      if (useDirected) directedEdgePixelCount += 1;

      const w1 = 1 / (gd1 + eps);
      const w2 = 1 / (gd2 + eps);
      const t1 = 0.5 * (fx + fy);
      const t2 = 0.5 * (1 - fx + fy);
      const blend = useDirected
        ? clampNumber((aniso - uniforms.edgeThreshold) / Math.max(1 - uniforms.edgeThreshold, 0.05), 0, 1) *
          uniforms.edgeSteeringStrength
        : 0;

      const outIdx = (oy * outWidth + ox) * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        const c00 = p00[ch] ?? 0;
        const c10 = p10[ch] ?? 0;
        const c01 = p01[ch] ?? 0;
        const c11 = p11[ch] ?? 0;
        const bilerp = c00 + (c10 - c00) * fx + (c01 + (c11 - c01) * fx - (c00 + (c10 - c00) * fx)) * fy;

        let est = bilerp;
        if (useDirected) {
          const d1 = c00 + (c11 - c00) * t1;
          const d2 = c10 + (c01 - c10) * t2;
          est = bilerp + ((w1 * d1 + w2 * d2) / (w1 + w2) - bilerp) * blend;
        }

        const localMean = 0.25 * (c00 + c10 + c01 + c11);
        const sharp = clampNumber(
          est + (est - localMean) * uniforms.sharpenStrength,
          Math.min(c00, c10, c01, c11),
          Math.max(c00, c10, c01, c11),
        );
        dst[outIdx + ch] = Math.round(clampNumber(sharp, 0, 1) * 255);
      }

      const aTop = p00[3] + (p10[3] - p00[3]) * fx;
      const aBot = p01[3] + (p11[3] - p01[3]) * fx;
      dst[outIdx + 3] = Math.round(clampNumber(aTop + (aBot - aTop) * fy, 0, 1) * 255);
    }
  }

  return {
    backend: "cpu-fallback",
    srcWidth,
    srcHeight,
    width: outWidth,
    height: outHeight,
    rgba: dst,
    uniforms,
    directedEdgePixelCount,
    averageEdgeContrast: contrastSum / Math.max(1, outWidth * outHeight),
  };
}

function isCjkOrHangulCodePoint(code: number): boolean {
  return (
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x3131 && code <= 0x318e) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

function measureGlyphAdvancePx(
  ch: string,
  fontSizePx: number,
  writingMode: BalloonWritingMode,
  letterSpacingEm: number,
): number {
  const code = ch.codePointAt(0) ?? 0;
  let ratio = 0.58;
  if (ch === " ") ratio = writingMode === "ttb" ? 0.5 : 0.34;
  else if (isCjkOrHangulCodePoint(code)) ratio = 1.0;
  else if (writingMode === "ttb") ratio = 0.85;
  else if (NARROW_LATIN_CHARS.has(ch)) ratio = 0.34;
  else if (WIDE_LATIN_CHARS.has(ch)) ratio = 0.86;
  else if (code >= 0x41 && code <= 0x5a) ratio = 0.68;
  return fontSizePx * (ratio + letterSpacingEm);
}

function measureStringAdvancePx(
  text: string,
  fontSizePx: number,
  writingMode: BalloonWritingMode,
  letterSpacingEm: number,
): number {
  let sum = 0;
  for (const ch of text) sum += measureGlyphAdvancePx(ch, fontSizePx, writingMode, letterSpacingEm);
  return sum;
}

function computeChordSpanAtNormalizedOffset(shape: BalloonShapeKind, maxSpanPx: number, normOffset: number): number {
  const u = clampNumber(normOffset, -1, 1);
  if (shape === "rect") return maxSpanPx;
  const ellipseFactor = Math.sqrt(Math.max(0, 1 - u * u));
  if (shape === "ellipse") return maxSpanPx * ellipseFactor;
  const scallopDip = 0.92 - 0.08 * Math.abs(Math.sin(u * Math.PI * 2));
  return maxSpanPx * ellipseFactor * scallopDip;
}

function countKinsokuViolations(lines: readonly string[]): number {
  let violations = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const chars = Array.from((lines[i] ?? "").trim());
    if (chars.length === 0) continue;
    const first = chars[0] ?? "";
    const last = chars[chars.length - 1] ?? "";
    if (i > 0 && KINSOKU_NO_START_CHARS.has(first)) violations += 1;
    if (i < lines.length - 1 && KINSOKU_NO_END_CHARS.has(last)) violations += 1;
  }
  return violations;
}

function wrapParagraphWithKinsoku(
  paragraph: string,
  locale: ReaderLocale,
  writingMode: BalloonWritingMode,
  fontSizePx: number,
  letterSpacingEm: number,
  getLineMaxSpan: (lineIdx: number) => number,
  startLineIdx: number,
): readonly string[] {
  const trimmed = paragraph.trim();
  if (trimmed.length === 0) return [""];

  if (locale === "en") {
    const words = trimmed.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const limit = getLineMaxSpan(startLineIdx + lines.length);
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (measureStringAdvancePx(candidate, fontSizePx, writingMode, letterSpacingEm) <= limit) {
        current = candidate;
      } else if (current.length > 0) {
        lines.push(current);
        current = word;
      } else {
        let chunk = "";
        for (const ch of word) {
          const nextChunk = chunk + ch;
          const chunkLimit = getLineMaxSpan(startLineIdx + lines.length);
          if (chunk.length > 0 && measureStringAdvancePx(nextChunk, fontSizePx, writingMode, letterSpacingEm) > chunkLimit) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = nextChunk;
          }
        }
        current = chunk;
      }
    }
    if (current.length > 0) lines.push(current);
    return lines;
  }

  const chars = Array.from(trimmed);
  const lines: string[] = [];
  let cursor = 0;

  while (cursor < chars.length) {
    while (cursor < chars.length && chars[cursor] === " " && lines.length > 0) cursor += 1;
    if (cursor >= chars.length) break;

    const lineLimit = Math.max(fontSizePx, getLineMaxSpan(startLineIdx + lines.length));
    let end = cursor;
    let width = 0;
    let lastSpaceIdx = -1;

    while (end < chars.length) {
      const ch = chars[end] ?? "";
      const adv = measureGlyphAdvancePx(ch, fontSizePx, writingMode, letterSpacingEm);
      if (end > cursor && width + adv > lineLimit) break;
      width += adv;
      if (ch === " ") lastSpaceIdx = end;
      end += 1;
    }

    if (end < chars.length) {
      if (locale === "ko" && lastSpaceIdx > cursor) {
        const beforeSpace = chars.slice(cursor, lastSpaceIdx).join("");
        if (measureStringAdvancePx(beforeSpace, fontSizePx, writingMode, letterSpacingEm) >= lineLimit * 0.55) {
          end = lastSpaceIdx;
        }
      }

      // 행두·행말 금칙 처리: 공백을 건너뛴 실제 경계 문자를 검사해 여는 괄호 고립·닫는 문장부호 행두를 차단한다.
      let guard = 0;
      while (end < chars.length && guard < 8) {
        guard += 1;
        let nextVisible = end;
        while (nextVisible < chars.length && chars[nextVisible] === " ") nextVisible += 1;
        let lastVisible = end - 1;
        while (lastVisible >= cursor && chars[lastVisible] === " ") lastVisible -= 1;

        const nextChar = nextVisible < chars.length ? (chars[nextVisible] ?? "") : "";
        const lastChar = lastVisible >= cursor ? (chars[lastVisible] ?? "") : "";

        if (nextChar.length > 0 && KINSOKU_NO_START_CHARS.has(nextChar)) {
          if (lastVisible > cursor && !KINSOKU_NO_END_CHARS.has(chars[lastVisible - 1] ?? "")) {
            end = lastVisible;
            continue;
          }
          end = nextVisible + 1;
          continue;
        }
        if (lastChar.length > 0 && KINSOKU_NO_END_CHARS.has(lastChar)) {
          if (lastVisible > cursor) {
            end = lastVisible;
            continue;
          }
          // 여는 괄호 혼자 줄에 고립되지 않도록 다음 문자를 결합한다.
          end = Math.min(chars.length, nextVisible + 1);
          continue;
        }
        break;
      }
    }

    const lineText = chars.slice(cursor, end).join("").trim();
    if (lineText.length > 0) lines.push(lineText);
    cursor = end;
  }

  return lines.length > 0 ? lines : [""];
}

interface LayoutAttempt {
  readonly fits: boolean;
  readonly lines: readonly PlacedBalloonLine[];
  readonly lineAdvancePx: number;
  readonly overflowRatio: number;
  readonly fillRatio: number;
  readonly kinsokuViolationCount: number;
}

function evaluateBalloonLayoutAtFontSize(
  input: BalloonReflowInput,
  writingMode: BalloonWritingMode,
  fontSizePx: number,
  innerWidth: number,
  innerHeight: number,
  insetX: number,
  insetY: number,
): LayoutAttempt {
  const lineHeightMultiplier = clampNumber(input.lineHeightMultiplier ?? (writingMode === "ttb" ? 1.38 : 1.32), 1.05, 2.2);
  const letterSpacingEm = clampNumber(input.letterSpacingEm ?? 0.02, -0.05, 0.3);
  const lineAdvancePx = fontSizePx * lineHeightMultiplier;

  const primaryInner = writingMode === "htb" ? innerWidth : innerHeight;
  const crossInner = writingMode === "htb" ? innerHeight : innerWidth;
  const paragraphs = input.text.replace(/\r\n/g, "\n").split("\n");

  const computePerLineLimits = (estimatedLines: number): ((idx: number) => number) => {
    const count = Math.max(1, estimatedLines);
    const totalCross = count * lineAdvancePx;
    const crossOrigin = -totalCross * 0.5;
    return (idx: number): number => {
      const cTop = crossOrigin + idx * lineAdvancePx;
      const cBot = cTop + fontSizePx;
      const uTop = crossInner > 0 ? (cTop * 2) / crossInner : 0;
      const uBot = crossInner > 0 ? (cBot * 2) / crossInner : 0;
      const safeSpan = Math.min(
        computeChordSpanAtNormalizedOffset(input.shape, primaryInner, uTop),
        computeChordSpanAtNormalizedOffset(input.shape, primaryInner, uBot),
      );
      return Math.max(fontSizePx * 1.1, safeSpan);
    };
  };

  const initialTotalAdvance = measureStringAdvancePx(input.text, fontSizePx, writingMode, letterSpacingEm);
  const approxLineWidth = primaryInner * (input.shape === "rect" ? 0.96 : 0.78);
  let estimatedLineCount = Math.max(paragraphs.length, Math.ceil(initialTotalAdvance / Math.max(fontSizePx, approxLineWidth)));

  let rawLines: string[] = [];
  let activeLimits = computePerLineLimits(estimatedLineCount);

  for (let pass = 0; pass < 2; pass += 1) {
    activeLimits = computePerLineLimits(estimatedLineCount);
    rawLines = [];
    for (const para of paragraphs) {
      rawLines.push(
        ...wrapParagraphWithKinsoku(para, input.locale, writingMode, fontSizePx, letterSpacingEm, activeLimits, rawLines.length),
      );
    }
    estimatedLineCount = Math.max(1, rawLines.length);
  }

  const totalCrossUsed = rawLines.length * lineAdvancePx;
  const crossFits = totalCrossUsed <= crossInner + 0.5;
  let maxPrimaryOverflow = 0;
  let usedArea = 0;
  const placed: PlacedBalloonLine[] = [];

  for (let i = 0; i < rawLines.length; i += 1) {
    const text = rawLines[i] ?? "";
    const advancePx = measureStringAdvancePx(text, fontSizePx, writingMode, letterSpacingEm);
    const maxAvailablePx = activeLimits(i);
    const ratio = maxAvailablePx > 0 ? advancePx / maxAvailablePx : 2;
    if (ratio > 1) maxPrimaryOverflow = Math.max(maxPrimaryOverflow, ratio - 1);
    usedArea += advancePx * lineAdvancePx;

    const crossOffset = (crossInner - totalCrossUsed) * 0.5 + i * lineAdvancePx;
    const primaryOffset = (primaryInner - advancePx) * 0.5;
    const x = writingMode === "htb" ? insetX + primaryOffset : insetX + innerWidth - crossOffset - fontSizePx;
    const y = writingMode === "htb" ? insetY + crossOffset : insetY + primaryOffset;

    placed.push({
      index: i,
      text,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      advancePx: Math.round(advancePx * 100) / 100,
      maxAvailablePx: Math.round(maxAvailablePx * 100) / 100,
      utilization: Math.round(ratio * 1000) / 1000,
    });
  }

  const crossOverflow = crossInner > 0 ? Math.max(0, totalCrossUsed / crossInner - 1) : 1;
  const overflowRatio = Math.max(crossOverflow, maxPrimaryOverflow);
  const kinsokuViolationCount = countKinsokuViolations(rawLines);
  const shapeAreaFactor = input.shape === "rect" ? 1 : input.shape === "ellipse" ? Math.PI * 0.25 : 0.68;
  const fillRatio = clampNumber(usedArea / Math.max(1, innerWidth * innerHeight * shapeAreaFactor), 0, 2);

  return {
    fits: crossFits && maxPrimaryOverflow <= 0.02 && kinsokuViolationCount === 0,
    lines: placed,
    lineAdvancePx: Math.round(lineAdvancePx * 100) / 100,
    overflowRatio: Math.round(overflowRatio * 1000) / 1000,
    fillRatio: Math.round(fillRatio * 1000) / 1000,
    kinsokuViolationCount,
  };
}

/**
 * AI 토큰을 전혀 소비하지 않고 `ko`/`en`/`ja`/`zh-Hans`/`zh-Hant` 대사를
 * 타원·사각·구름 말풍선 안전 영역(Safe Inset) 안에 이진 탐색으로 최적 조판한다.
 */
export function reflowBalloonTextForLocale(input: BalloonReflowInput): BalloonReflowResult {
  const writingMode: BalloonWritingMode =
    input.writingMode ?? (input.locale === "ja" || input.locale === "zh-Hant" ? "ttb" : "htb");
  const widthPx = Math.max(40, input.widthPx);
  const heightPx = Math.max(40, input.heightPx);
  const insetRatio = clampNumber(input.safeInsetRatio ?? (input.shape === "rect" ? 0.08 : 0.12), 0.02, 0.35);
  const insetX = input.safeInsetPx !== undefined ? Math.min(widthPx * 0.35, Math.max(2, input.safeInsetPx)) : widthPx * insetRatio;
  const insetY = input.safeInsetPx !== undefined ? Math.min(heightPx * 0.35, Math.max(2, input.safeInsetPx)) : heightPx * insetRatio;
  const innerWidth = Math.max(16, widthPx - insetX * 2);
  const innerHeight = Math.max(16, heightPx - insetY * 2);

  const minFont = Math.max(6, input.minFontSizePx ?? 10);
  const maxFont = Math.max(minFont, input.maxFontSizePx ?? 36);

  let lo = minFont;
  let hi = maxFont;
  let bestFont = minFont;
  let bestAttempt = evaluateBalloonLayoutAtFontSize(input, writingMode, minFont, innerWidth, innerHeight, insetX, insetY);

  if (bestAttempt.fits) {
    for (let iter = 0; iter < 16; iter += 1) {
      const mid = (lo + hi) * 0.5;
      const attempt = evaluateBalloonLayoutAtFontSize(input, writingMode, mid, innerWidth, innerHeight, insetX, insetY);
      if (attempt.fits) {
        bestFont = mid;
        bestAttempt = attempt;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const quantized = Math.max(minFont, Math.floor(bestFont * 4) / 4);
    const verified = evaluateBalloonLayoutAtFontSize(input, writingMode, quantized, innerWidth, innerHeight, insetX, insetY);
    if (verified.fits) {
      bestFont = quantized;
      bestAttempt = verified;
    }
  }

  const overflow = !bestAttempt.fits;
  let readabilityGrade: BalloonReadabilityGrade = "optimal";
  if (overflow) readabilityGrade = "overflow";
  else if (bestFont <= minFont + 1.5 || bestAttempt.fillRatio > 0.88) readabilityGrade = "cramped";
  else if (bestAttempt.fillRatio > 0.72) readabilityGrade = "tight";

  const remediationHints: string[] = [];
  if (overflow) {
    remediationHints.push("말풍선 크기를 넓히거나 대사를 줄여 최소 글꼴 크기 내로 맞춰 주세요.");
  } else if (readabilityGrade === "cramped") {
    remediationHints.push("가독성 여백이 좁습니다. 안전 여백을 유지하려면 말풍선을 15% 이상 확장하는 편이 안전합니다.");
  }
  if (bestAttempt.kinsokuViolationCount > 0) {
    remediationHints.push("문장 첫머리 문장부호 또는 강제 줄바꿈 위치의 금칙 문자를 점검해 주세요.");
  }

  return {
    locale: input.locale,
    writingMode,
    shape: input.shape,
    fittedFontSizePx: Math.round(bestFont * 100) / 100,
    lineAdvancePx: bestAttempt.lineAdvancePx,
    lines: bestAttempt.lines,
    lineCount: bestAttempt.lines.length,
    overflow,
    overflowRatio: bestAttempt.overflowRatio,
    fillRatio: bestAttempt.fillRatio,
    kinsokuViolationCount: bestAttempt.kinsokuViolationCount,
    readabilityGrade,
    remediationHints,
  };
}
