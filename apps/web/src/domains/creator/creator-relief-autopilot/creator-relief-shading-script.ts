/**
 * 작화 오토파일럿 엔진 ③④:
 * ③ 색조 시프트 기반 5-톤 웹툰 음영 팔레트 (`deriveWebtoon5ToneShadingRamp`)
 * ④ 대본 → 말풍선 자동 분절·호흡 오토파일럿 (`autoLayoutScriptToBalloons`)
 */

import {
  clampInt,
  clampNumber,
  roundTo,
  type AutoBalloonLayoutResult,
  type BalloonStyleId,
  type BilingualLabel,
  type OklchColor,
  type RgbColor,
  type ScriptBalloonLayoutItem,
  type ShadingLightingMoodId,
  type ShadingRampStop,
  type Webtoon5ToneShadingRamp,
} from "./creator-relief-types";

/* ============================================================================
 * ③ 캐릭터 1클릭 5-톤 웹툰 음영 팔레트 — OKLCH Hue-Shifting 색과학 엔진
 * ============================================================================ */

interface LightingMoodShiftSpec {
  readonly highlightTargetHue: number;
  readonly highlightHuePull: number;
  readonly highlightLift: number;
  readonly highlightChromaScale: number;
  readonly shadow1TargetHue: number;
  readonly shadow1HuePull: number;
  readonly shadow1Drop: number;
  readonly shadow1ChromaScale: number;
  readonly shadow2TargetHue: number;
  readonly shadow2HuePull: number;
  readonly shadow2Drop: number;
  readonly shadow2ChromaScale: number;
  readonly rimTargetHue: number;
  readonly rimHuePull: number;
  readonly rimLightness: number;
  readonly rimMinChroma: number;
}

const LIGHTING_MOOD_SPECS: Readonly<Record<ShadingLightingMoodId, LightingMoodShiftSpec>> = {
  "warm-day": {
    highlightTargetHue: 92,
    highlightHuePull: 0.34,
    highlightLift: 0.42,
    highlightChromaScale: 0.88,
    shadow1TargetHue: 268,
    shadow1HuePull: 0.3,
    shadow1Drop: 0.19,
    shadow1ChromaScale: 1.12,
    shadow2TargetHue: 282,
    shadow2HuePull: 0.48,
    shadow2Drop: 0.24,
    shadow2ChromaScale: 1.06,
    rimTargetHue: 96,
    rimHuePull: 0.72,
    rimLightness: 0.92,
    rimMinChroma: 0.08,
  },
  "cool-night": {
    highlightTargetHue: 222,
    highlightHuePull: 0.42,
    highlightLift: 0.34,
    highlightChromaScale: 0.84,
    shadow1TargetHue: 256,
    shadow1HuePull: 0.42,
    shadow1Drop: 0.22,
    shadow1ChromaScale: 1.18,
    shadow2TargetHue: 274,
    shadow2HuePull: 0.58,
    shadow2Drop: 0.26,
    shadow2ChromaScale: 1.1,
    rimTargetHue: 218,
    rimHuePull: 0.82,
    rimLightness: 0.88,
    rimMinChroma: 0.1,
  },
  sunset: {
    highlightTargetHue: 66,
    highlightHuePull: 0.46,
    highlightLift: 0.4,
    highlightChromaScale: 1.06,
    shadow1TargetHue: 326,
    shadow1HuePull: 0.38,
    shadow1Drop: 0.2,
    shadow1ChromaScale: 1.16,
    shadow2TargetHue: 298,
    shadow2HuePull: 0.54,
    shadow2Drop: 0.25,
    shadow2ChromaScale: 1.08,
    rimTargetHue: 52,
    rimHuePull: 0.84,
    rimLightness: 0.86,
    rimMinChroma: 0.14,
  },
  "rofan-pastel": {
    highlightTargetHue: 80,
    highlightHuePull: 0.36,
    highlightLift: 0.46,
    highlightChromaScale: 0.78,
    shadow1TargetHue: 314,
    shadow1HuePull: 0.36,
    shadow1Drop: 0.16,
    shadow1ChromaScale: 1.06,
    shadow2TargetHue: 292,
    shadow2HuePull: 0.5,
    shadow2Drop: 0.2,
    shadow2ChromaScale: 1.02,
    rimTargetHue: 32,
    rimHuePull: 0.75,
    rimLightness: 0.94,
    rimMinChroma: 0.06,
  },
};

function srgbChannelToLinear(channel255: number): number {
  const v = clampNumber(channel255, 0, 255) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(linear: number): number {
  const v = clampNumber(linear, 0, 1);
  const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return clampInt(srgb * 255, 0, 255);
}

/** WCAG 2.1 상대 휘도(0..1) 계산. */
export function computeRelativeLuminance(rgb: RgbColor): number {
  const lr = srgbChannelToLinear(rgb.r);
  const lg = srgbChannelToLinear(rgb.g);
  const lb = srgbChannelToLinear(rgb.b);
  return roundTo(0.2126 * lr + 0.7152 * lg + 0.0722 * lb, 5);
}

/** sRGB(0..255) → OKLCH 변환. */
export function srgbToOklch(rgb: RgbColor): OklchColor {
  const lr = srgbChannelToLinear(rgb.r);
  const lg = srgbChannelToLinear(rgb.g);
  const lb = srgbChannelToLinear(rgb.b);

  const lCube = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const mCube = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const sCube = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * lCube + 0.793617785 * mCube - 0.0040720468 * sCube;
  const a = 1.9779984951 * lCube - 2.428592205 * mCube + 0.4505937099 * sCube;
  const b = 0.0259040371 * lCube + 0.7827717662 * mCube - 0.808675766 * sCube;

  const C = Math.hypot(a, b);
  const rawHue = C < 1e-5 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  const H = ((rawHue % 360) + 360) % 360;

  return {
    l: roundTo(clampNumber(L, 0, 1), 4),
    c: roundTo(Math.max(0, C), 4),
    h: roundTo(H, 2),
  };
}

function oklchToLinearRgb(l: number, c: number, hDeg: number): readonly [number, number, number] {
  const rad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const lCube = l + 0.3963377774 * a + 0.2158037573 * b;
  const mCube = l - 0.1055613458 * a - 0.0638541728 * b;
  const sCube = l - 0.0894841775 * a - 1.291485548 * b;

  const lLin = lCube * lCube * lCube;
  const mLin = mCube * mCube * mCube;
  const sLin = sCube * sCube * sCube;

  return [
    4.0767416621 * lLin - 3.3077115913 * mLin + 0.2309699292 * sLin,
    -1.2684380046 * lLin + 2.6097574011 * mLin - 0.3413193965 * sLin,
    -0.0041960863 * lLin - 0.7034186147 * mLin + 1.707614701 * sLin,
  ];
}

function isInLinearSrgbGamut(rgb: readonly [number, number, number]): boolean {
  const eps = 1e-4;
  return (
    rgb[0] >= -eps &&
    rgb[0] <= 1 + eps &&
    rgb[1] >= -eps &&
    rgb[1] <= 1 + eps &&
    rgb[2] >= -eps &&
    rgb[2] <= 1 + eps
  );
}

/** Chroma 이진 탐색 색역 매핑으로 명도·색조를 유지하며 OKLCH → sRGB 변환. */
export function oklchToSrgb(oklch: OklchColor): RgbColor {
  const targetL = clampNumber(oklch.l, 0, 1);
  const targetH = ((oklch.h % 360) + 360) % 360;
  let targetC = Math.max(0, oklch.c);

  let lin = oklchToLinearRgb(targetL, targetC, targetH);
  if (!isInLinearSrgbGamut(lin)) {
    let low = 0;
    let high = targetC;
    for (let step = 0; step < 18; step += 1) {
      const mid = (low + high) / 2;
      const candidate = oklchToLinearRgb(targetL, mid, targetH);
      if (isInLinearSrgbGamut(candidate)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    targetC = low;
    lin = oklchToLinearRgb(targetL, targetC, targetH);
  }

  return {
    r: linearToSrgbChannel(lin[0]),
    g: linearToSrgbChannel(lin[1]),
    b: linearToSrgbChannel(lin[2]),
  };
}

function shiftHueToward(
  baseHue: number,
  targetHue: number,
  pull: number,
  baseChroma: number,
): number {
  if (baseChroma < 0.012) {
    return ((targetHue % 360) + 360) % 360;
  }
  let delta = ((targetHue - baseHue + 540) % 360) - 180;
  if (Math.abs(delta) < 1) delta = 0;
  return (((baseHue + delta * pull) % 360) + 360) % 360;
}

function signedHueDelta(baseHue: number, shiftedHue: number): number {
  return roundTo(((shiftedHue - baseHue + 540) % 360) - 180, 1);
}

/** 순수 수치 RGB 객체를 복사용 16진 문자열로 포맷한다(코드 내 원시 hex 리터럴 0건). */
export function formatRgbToHex(rgb: RgbColor): string {
  const toHexByte = (v: number): string =>
    clampInt(v, 0, 255).toString(16).padStart(2, "0").toUpperCase();
  return `${String.fromCharCode(35)}${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`;
}

function resolveMonotonicStopRgb(
  initialL: number,
  chroma: number,
  hue: number,
  direction: "brighter" | "darker",
  referenceLuminance: number,
): RgbColor {
  let currentL = clampNumber(initialL, 0.02, 0.992);
  let rgb = oklchToSrgb({ l: currentL, c: chroma, h: hue });

  for (let retry = 0; retry < 5; retry += 1) {
    const lum = computeRelativeLuminance(rgb);
    if (direction === "brighter" && lum > referenceLuminance + 0.002) return rgb;
    if (direction === "darker" && lum < referenceLuminance - 0.002) return rgb;
    currentL = clampNumber(currentL + (direction === "brighter" ? 0.03 : -0.035), 0.015, 0.996);
    rgb = oklchToSrgb({ l: currentL, c: chroma * 0.92, h: hue });
  }
  return rgb;
}

/**
 * 기본 RGB 색상과 조명 무드를 받아 색조 시프트(Hue-Shifting) 수학으로
 * 5-톤 웹툰 음영 팔레트(highlight · base · shadow1 · shadow2 · rimLight)를 산출한다.
 */
export function deriveWebtoon5ToneShadingRamp(
  baseRgb: RgbColor,
  lightingMood: ShadingLightingMoodId,
): Webtoon5ToneShadingRamp {
  const sanitizedBase: RgbColor = {
    r: clampInt(baseRgb.r, 0, 255),
    g: clampInt(baseRgb.g, 0, 255),
    b: clampInt(baseRgb.b, 0, 255),
  };
  const spec = LIGHTING_MOOD_SPECS[lightingMood];
  const baseOklch = srgbToOklch(sanitizedBase);
  const baseLuminance = computeRelativeLuminance(sanitizedBase);
  const chromaticFloor = Math.max(baseOklch.c, 0.032);

  const hlHue = shiftHueToward(baseOklch.h, spec.highlightTargetHue, spec.highlightHuePull, baseOklch.c);
  const hlTargetL = Math.min(0.988, baseOklch.l + Math.max(0.065, (1 - baseOklch.l) * spec.highlightLift));
  const hlRgb = resolveMonotonicStopRgb(
    hlTargetL,
    chromaticFloor * spec.highlightChromaScale,
    hlHue,
    "brighter",
    baseLuminance,
  );
  const hlOklch = srgbToOklch(hlRgb);

  const sh1Hue = shiftHueToward(baseOklch.h, spec.shadow1TargetHue, spec.shadow1HuePull, baseOklch.c);
  const sh1TargetL = Math.max(0.14, baseOklch.l - Math.max(0.11, baseOklch.l * spec.shadow1Drop));
  const sh1Rgb = resolveMonotonicStopRgb(
    sh1TargetL,
    chromaticFloor * spec.shadow1ChromaScale,
    sh1Hue,
    "darker",
    baseLuminance,
  );
  const sh1Oklch = srgbToOklch(sh1Rgb);
  const sh1Luminance = computeRelativeLuminance(sh1Rgb);

  const sh2Hue = shiftHueToward(baseOklch.h, spec.shadow2TargetHue, spec.shadow2HuePull, baseOklch.c);
  const sh2TargetL = Math.max(0.05, sh1Oklch.l - Math.max(0.11, sh1Oklch.l * spec.shadow2Drop));
  const sh2Rgb = resolveMonotonicStopRgb(
    sh2TargetL,
    chromaticFloor * spec.shadow2ChromaScale,
    sh2Hue,
    "darker",
    sh1Luminance,
  );
  const sh2Oklch = srgbToOklch(sh2Rgb);

  const rimHue = shiftHueToward(baseOklch.h, spec.rimTargetHue, spec.rimHuePull, baseOklch.c);
  const rimRgb = oklchToSrgb({
    l: Math.max(spec.rimLightness, Math.min(0.97, baseOklch.l + 0.16)),
    c: Math.max(spec.rimMinChroma, baseOklch.c * 0.82),
    h: rimHue,
  });
  const rimOklch = srgbToOklch(rimRgb);

  const highlight: ShadingRampStop = {
    role: "highlight",
    label: { ko: "하이라이트", en: "Highlight" },
    usageHint: { ko: "광원 정면 반사광 · 머리카락 엔젤링", en: "Direct light bounce & hair sheen" },
    rgb: hlRgb,
    oklch: hlOklch,
    relativeLuminance: computeRelativeLuminance(hlRgb),
    hueShiftDeg: signedHueDelta(baseOklch.h, hlOklch.h),
    blendModeHint: "screen",
  };
  const base: ShadingRampStop = {
    role: "base",
    label: { ko: "기본 밑색", en: "Base Tone" },
    usageHint: { ko: "캐릭터 고유 색 지정(플랫 채색)", en: "Flat character local color" },
    rgb: sanitizedBase,
    oklch: baseOklch,
    relativeLuminance: baseLuminance,
    hueShiftDeg: 0,
    blendModeHint: "normal",
  };
  const shadow1: ShadingRampStop = {
    role: "shadow1",
    label: { ko: "1차 음영", en: "Shadow 1" },
    usageHint: { ko: "셀 채색 기본 그림자 · 얼굴·옷 주름", en: "Primary cel-shading shadow" },
    rgb: sh1Rgb,
    oklch: sh1Oklch,
    relativeLuminance: sh1Luminance,
    hueShiftDeg: signedHueDelta(baseOklch.h, sh1Oklch.h),
    blendModeHint: "multiply",
  };
  const shadow2: ShadingRampStop = {
    role: "shadow2",
    label: { ko: "2차 깊은 음영", en: "Shadow 2 (AO)" },
    usageHint: { ko: "턱 아래·옷깃 접힘 깊은 그림자", en: "Deep ambient occlusion crevices" },
    rgb: sh2Rgb,
    oklch: sh2Oklch,
    relativeLuminance: computeRelativeLuminance(sh2Rgb),
    hueShiftDeg: signedHueDelta(baseOklch.h, sh2Oklch.h),
    blendModeHint: "multiply",
  };
  const rimLight: ShadingRampStop = {
    role: "rimLight",
    label: { ko: "역광 림라이트", en: "Rim Light" },
    usageHint: { ko: "배경과 인물을 분리하는 외곽 테두리광", en: "Backlit edge separating figure from BG" },
    rgb: rimRgb,
    oklch: rimOklch,
    relativeLuminance: computeRelativeLuminance(rimRgb),
    hueShiftDeg: signedHueDelta(baseOklch.h, rimOklch.h),
    blendModeHint: "add",
  };

  return {
    lightingMood,
    baseInput: sanitizedBase,
    highlight,
    base,
    shadow1,
    shadow2,
    rimLight,
    stops: [highlight, base, shadow1, shadow2, rimLight],
  };
}

/* ============================================================================
 * ④ 대본 붙여넣기 → 말풍선 자동 분절·호흡 오토파일럿
 * ============================================================================ */

export const MAX_BALLOON_CHARS = 38;

interface ParsedScriptBeat {
  readonly speaker: string | null;
  readonly style: BalloonStyleId;
  readonly content: string;
}

function parseSingleScriptLine(rawLine: string): ParsedScriptBeat | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  const narrationTagMatch = trimmed.match(/^\[(?:나레이션|내레이션|해설|narration)\]\s*[:：]?\s*(.+)$/iu);
  if (narrationTagMatch) {
    return { speaker: null, style: "narration", content: narrationTagMatch[1].trim() };
  }

  const bracketNarrationMatch = trimmed.match(/^\[(.+)\]$/u);
  if (bracketNarrationMatch) {
    return { speaker: null, style: "narration", content: bracketNarrationMatch[1].trim() };
  }

  let speaker: string | null = null;
  let body = trimmed;
  const speakerMatch = trimmed.match(/^([^:：[\]()]{1,22})\s*[:：]\s*(.+)$/u);
  if (speakerMatch) {
    const candidateSpeaker = speakerMatch[1].trim();
    const candidateBody = speakerMatch[2].trim();
    if (/^(?:나레이션|내레이션|해설|narration)$/iu.test(candidateSpeaker)) {
      return { speaker: null, style: "narration", content: candidateBody };
    }
    speaker = candidateSpeaker;
    body = candidateBody;
  }

  const innerNarration = body.match(/^\[(?:나레이션|내레이션|해설|narration)\]\s*(.+)$/iu);
  if (innerNarration) {
    return { speaker: null, style: "narration", content: innerNarration[1].trim() };
  }

  const parenThought = body.match(/^[(\uFF08](.+)[)\uFF09]$/u);
  if (parenThought) {
    return { speaker, style: "thought", content: parenThought[1].trim() };
  }

  return { speaker, style: body.includes("!") ? "shout" : "speech", content: body };
}

function splitLongTextBalanced(text: string, maxChars: number): readonly string[] {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const sentences = clean
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  const pushBalancedPhrase = (phrase: string): void => {
    let remaining = phrase.trim();
    while (remaining.length > maxChars) {
      const idealSplit = Math.min(
        maxChars,
        Math.ceil(remaining.length / Math.ceil(remaining.length / maxChars)),
      );
      let splitAt = -1;

      const punctCandidates: number[] = [];
      for (let i = 8; i <= maxChars; i += 1) {
        const ch = remaining[i - 1];
        if (ch === "," || ch === ";" || ch === "·" || ch === "—" || ch === "…") {
          punctCandidates.push(i);
        }
      }
      if (punctCandidates.length > 0) {
        splitAt = punctCandidates.reduce((best, cur) =>
          Math.abs(cur - idealSplit) < Math.abs(best - idealSplit) ? cur : best,
        );
      }

      if (splitAt === -1) {
        const spaceCandidates: number[] = [];
        for (let i = 6; i <= maxChars; i += 1) {
          if (remaining[i] === " ") spaceCandidates.push(i);
        }
        if (spaceCandidates.length > 0) {
          splitAt = spaceCandidates.reduce((best, cur) =>
            Math.abs(cur - idealSplit) < Math.abs(best - idealSplit) ? cur : best,
          );
        }
      }

      if (splitAt <= 0 || splitAt > maxChars) splitAt = maxChars;

      const head = remaining.slice(0, splitAt).trim();
      if (head) chunks.push(head);
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) chunks.push(remaining);
  };

  let buffer = "";
  for (const sentence of sentences) {
    if (!buffer) {
      if (sentence.length <= maxChars) buffer = sentence;
      else pushBalancedPhrase(sentence);
    } else if (`${buffer} ${sentence}`.length <= maxChars) {
      buffer = `${buffer} ${sentence}`;
    } else {
      chunks.push(buffer);
      buffer = "";
      if (sentence.length <= maxChars) buffer = sentence;
      else pushBalancedPhrase(sentence);
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function wrapLinesInsideBalloon(text: string, targetLineLen = 14): readonly string[] {
  if (text.length <= targetLineLen) return [text];
  const words = text.split(" ");
  if (words.length === 1) {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += targetLineLen) {
      out.push(text.slice(i, i + targetLineLen));
    }
    return out;
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= targetLineLen) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function resolveBalloonPacing(
  style: BalloonStyleId,
  text: string,
  isSplitContinuation: boolean,
  isLastInBeat: boolean,
): { readonly gutterPx: number; readonly pacingNote: BilingualLabel } {
  if (!isLastInBeat) {
    return {
      gutterPx: 42,
      pacingNote: { ko: "호흡 이어가기 (분절 연결)", en: "Linked breath continuation" },
    };
  }
  if (style === "narration") {
    return { gutterPx: 168, pacingNote: { ko: "장면 전환 나레이션 여백", en: "Scene-shift narration pause" } };
  }
  if (style === "thought") {
    return { gutterPx: 144, pacingNote: { ko: "속마음 여운 호흡", en: "Introspective thought breath" } };
  }
  if (style === "shout") {
    return { gutterPx: 54, pacingNote: { ko: "강한 외침 · 빠른 스크롤 템포", en: "High-impact shout tempo" } };
  }
  if (text.includes("?") || /\.{2,}|…/u.test(text)) {
    return { gutterPx: 124, pacingNote: { ko: "질문·여운 반응 대기 여백", en: "Question / suspense beat" } };
  }
  return {
    gutterPx: isSplitContinuation ? 96 : 88,
    pacingNote: { ko: "표준 대화 리듬", en: "Standard dialogue cadence" },
  };
}

/**
 * `"화자: 대사"` 형식의 대본을 파싱해 38자 가독 한도 기준 자연 분절,
 * 말풍선 스타일(`speech`/`shout`/`thought`/`narration`) 및 호흡 여백(`gutterPx`)을 산출한다.
 */
export function autoLayoutScriptToBalloons(rawScript: string): AutoBalloonLayoutResult {
  const rawLines = rawScript.split(/\r?\n/u);
  const parsedBeats: ParsedScriptBeat[] = [];
  for (const line of rawLines) {
    const parsed = parseSingleScriptLine(line);
    if (parsed) parsedBeats.push(parsed);
  }

  const speakerSideMap = new Map<string, "left" | "right">();
  let nextAutoSide: "left" | "right" = "left";
  const items: ScriptBalloonLayoutItem[] = [];
  let splitCount = 0;

  parsedBeats.forEach((beat, beatIdx) => {
    const segments = splitLongTextBalanced(beat.content, MAX_BALLOON_CHARS);
    if (segments.length > 1) splitCount += segments.length - 1;

    let side: "left" | "right" | "center" = "center";
    if (beat.style !== "narration") {
      if (beat.speaker) {
        const existing = speakerSideMap.get(beat.speaker);
        if (existing) {
          side = existing;
        } else {
          side = nextAutoSide;
          speakerSideMap.set(beat.speaker, side);
          nextAutoSide = nextAutoSide === "left" ? "right" : "left";
        }
      } else {
        side = nextAutoSide;
        nextAutoSide = nextAutoSide === "left" ? "right" : "left";
      }
    }

    segments.forEach((segmentText, segIdx) => {
      const isSplitContinuation = segIdx > 0;
      const isLastInBeat = segIdx === segments.length - 1;
      const effectiveStyle: BalloonStyleId =
        beat.style === "narration" || beat.style === "thought"
          ? beat.style
          : segmentText.includes("!")
            ? "shout"
            : "speech";

      const { gutterPx, pacingNote } = resolveBalloonPacing(
        effectiveStyle,
        segmentText,
        isSplitContinuation,
        isLastInBeat,
      );

      const baseX = side === "left" ? 30 : side === "right" ? 70 : 50;
      const staggerX = isSplitContinuation ? (side === "left" ? 8 : side === "right" ? -8 : 0) : 0;

      items.push({
        id: `balloon-${beatIdx + 1}-${segIdx + 1}`,
        cutIndex: beatIdx + 1,
        sequenceIndex: items.length,
        speaker: beat.speaker,
        style: effectiveStyle,
        text: segmentText,
        lines: wrapLinesInsideBalloon(segmentText),
        charCount: segmentText.length,
        isSplitContinuation,
        side,
        anchor: {
          x: roundTo(clampNumber(baseX + staggerX, 16, 84), 1),
          y: roundTo(18 + (segIdx % 3) * 28, 1),
        },
        gutterPx,
        pacingNote,
      });
    });
  });

  const estimatedScrollHeightPx = items.reduce(
    (sum, item) => sum + 92 + item.lines.length * 22 + item.gutterPx,
    0,
  );

  return {
    maxCharsPerBalloon: MAX_BALLOON_CHARS,
    totalInputLines: parsedBeats.length,
    totalBalloons: items.length,
    splitCount,
    estimatedScrollHeightPx,
    items,
  };
}
