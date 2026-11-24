/**
 * 노코드 시각 커스텀 WGSL 셰이더 빌더 (Wave 33 Track C).
 *
 * - 한글·영문 자연어 질감/조명 프롬프트 또는 레퍼런스 컬러 스와치를 파싱해
 *   16바이트 정렬 uniform 계약 기반의 실제 유효 `@compute` / `@fragment` WGSL 코드를 생성한다.
 * - 동일한 수학 커널을 결정론적 CPU 프리뷰 래스터라이저로 즉시 실행해 RGBA 버퍼와 통계를 산출한다.
 * - 원시 CSS 색상 리터럴 없이 0..1 정규화 채널 구조체(`UnitRgb`)만 사용한다.
 */

export type ShaderStageMode = "compute" | "fragment";
export type TextureStyleKind =
  | "watercolor-paper" | "neon-halftone" | "oil-impasto" | "cel-2step"
  | "pencil-hatch" | "film-grain" | "clean-studio";
export type LightingStyleKind =
  | "warm-rim" | "cyber-neon" | "directional-key"
  | "cel-hard-shadow" | "soft-ambient" | "moonlight-backrim";
export type SwatchColorRole = "key" | "rim" | "shadow" | "accent";

export interface UnitRgb { readonly r: number; readonly g: number; readonly b: number; }
export interface ReferenceColorSwatch {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly role: SwatchColorRole; readonly color: UnitRgb;
}
export interface NoCodeShaderPromptInput {
  readonly prompt?: string; readonly swatches?: readonly ReferenceColorSwatch[];
  readonly targetStage?: ShaderStageMode; readonly previewWidth?: number; readonly previewHeight?: number;
  readonly intensity?: number; readonly seed?: number; readonly sourceRgba?: Uint8ClampedArray;
}
export interface NoCodeShaderPreset {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly promptKo: string; readonly promptEn: string;
  readonly style: TextureStyleKind; readonly lighting: LightingStyleKind;
}
export interface ReferenceSwatchPalettePreset {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly swatches: readonly ReferenceColorSwatch[];
}
export interface NoCodeShaderUniformSpec {
  readonly styleId: number; readonly lightingId: number;
  readonly keyColor: UnitRgb; readonly rimColor: UnitRgb;
  readonly shadowColor: UnitRgb; readonly accentColor: UnitRgb;
  readonly intensity: number; readonly rimStrength: number;
  readonly shadowFloor: number; readonly saturationBoost: number;
  readonly grainScale: number; readonly patternParam: number;
  readonly reliefStrength: number; readonly seedNorm: number;
  readonly uniformByteLength: 96;
}
export interface ParsedNoCodeShaderRecipe {
  readonly prompt: string; readonly inputMode: "prompt" | "swatches" | "hybrid" | "default";
  readonly style: TextureStyleKind; readonly lighting: LightingStyleKind;
  readonly matchedKeywords: readonly string[];
  readonly summaryKo: string; readonly summaryEn: string;
  readonly uniforms: NoCodeShaderUniformSpec;
}
export interface WgslValidationResult {
  readonly valid: boolean; readonly errors: readonly string[];
  readonly stage: ShaderStageMode; readonly entryPoint: string;
  readonly lineCount: number; readonly bindingCount: number; readonly uniformByteLength: number;
}
export interface NoCodeShaderPreviewStats {
  readonly meanLuma: number; readonly contrastStdDev: number;
  readonly meanSaturation: number; readonly rimPixelRatio: number;
  readonly dominantRgb: UnitRgb; readonly elapsedMs: number;
}
export interface NoCodeShaderCpuPreview {
  readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray;
  readonly digestHex: string; readonly lumaGrid8x8: readonly number[];
  readonly stats: NoCodeShaderPreviewStats;
}
export interface BuiltNoCodeShaderBundle {
  readonly recipe: ParsedNoCodeShaderRecipe; readonly targetStage: ShaderStageMode;
  readonly primaryWgsl: string; readonly computeWgsl: string; readonly fragmentWgsl: string;
  readonly computeValidation: WgslValidationResult; readonly fragmentValidation: WgslValidationResult;
  readonly uniformBufferWords: Uint32Array; readonly preview: NoCodeShaderCpuPreview;
}

export const NOCODE_SHADER_UNIFORM_BYTES = 96 as const;
export const NOCODE_SHADER_WORKGROUP_SIZE = [16, 16, 1] as const;

const STYLE_IDS: Readonly<Record<TextureStyleKind, number>> = {
  "clean-studio": 0, "watercolor-paper": 1, "neon-halftone": 2, "oil-impasto": 3,
  "cel-2step": 4, "pencil-hatch": 5, "film-grain": 6,
};
const LIGHTING_IDS: Readonly<Record<LightingStyleKind, number>> = {
  "soft-ambient": 0, "warm-rim": 1, "cyber-neon": 2,
  "directional-key": 3, "cel-hard-shadow": 4, "moonlight-backrim": 5,
};

export const NOCODE_SHADER_PRESETS: readonly NoCodeShaderPreset[] = [
  { id: "watercolor-warm-rim", labelKo: "따뜻한 수채화 종이 림라이트", labelEn: "Warm Watercolor Paper Rim Light", promptKo: "따뜻한 수채화 종이 림라이트", promptEn: "warm watercolor paper rim light", style: "watercolor-paper", lighting: "warm-rim" },
  { id: "cyberpunk-neon-halftone", labelKo: "사이버펑크 네온 하프톤", labelEn: "Cyberpunk Neon Halftone", promptKo: "사이버펑크 네온 하프톤", promptEn: "cyberpunk neon halftone", style: "neon-halftone", lighting: "cyber-neon" },
  { id: "oil-thick-impasto", labelKo: "유화 두꺼운 임파스토", labelEn: "Thick Oil Impasto", promptKo: "유화 두꺼운 임파스토", promptEn: "thick oil impasto", style: "oil-impasto", lighting: "directional-key" },
  { id: "cel-anime-2step", labelKo: "셀 애니메이션 2단 그림자", labelEn: "Cel Anime 2-Step Shadow", promptKo: "셀 애니메이션 2단 그림자", promptEn: "cel anime 2-step shadow", style: "cel-2step", lighting: "cel-hard-shadow" },
];

export const REFERENCE_SWATCH_PRESETS: readonly ReferenceSwatchPalettePreset[] = [
  {
    id: "atelier-amber", labelKo: "아틀리에 노을 스와치", labelEn: "Atelier Sunset Swatch",
    swatches: [
      { id: "am-key", labelKo: "웜 키톤", labelEn: "Warm Key", role: "key", color: { r: 0.91, g: 0.72, b: 0.56 } },
      { id: "am-rim", labelKo: "골드 림광", labelEn: "Gold Rim", role: "rim", color: { r: 0.99, g: 0.85, b: 0.54 } },
      { id: "am-shd", labelKo: "코코아 음영", labelEn: "Cocoa Shadow", role: "shadow", color: { r: 0.34, g: 0.25, b: 0.31 } },
      { id: "am-acc", labelKo: "코랄 포인트", labelEn: "Coral Accent", role: "accent", color: { r: 0.93, g: 0.45, b: 0.36 } },
    ],
  },
  {
    id: "cyber-duotone", labelKo: "네온 시안·마젠타 스와치", labelEn: "Neon Cyan-Magenta Swatch",
    swatches: [
      { id: "cy-key", labelKo: "인디고 베이스", labelEn: "Indigo Base", role: "key", color: { r: 0.32, g: 0.38, b: 0.76 } },
      { id: "cy-rim", labelKo: "시안 림광", labelEn: "Cyan Rim", role: "rim", color: { r: 0.14, g: 0.95, b: 0.98 } },
      { id: "cy-shd", labelKo: "딥 나이트", labelEn: "Deep Night", role: "shadow", color: { r: 0.08, g: 0.06, b: 0.19 } },
      { id: "cy-acc", labelKo: "네온 마젠타", labelEn: "Neon Magenta", role: "accent", color: { r: 0.98, g: 0.19, b: 0.72 } },
    ],
  },
  {
    id: "moonlit-cel", labelKo: "달빛 셀 블루 스와치", labelEn: "Moonlit Cel Blue Swatch",
    swatches: [
      { id: "ml-key", labelKo: "페일 아이보리", labelEn: "Pale Ivory", role: "key", color: { r: 0.86, g: 0.89, b: 0.95 } },
      { id: "ml-rim", labelKo: "실버 문라이트", labelEn: "Silver Moonlight", role: "rim", color: { r: 0.78, g: 0.92, b: 1.0 } },
      { id: "ml-shd", labelKo: "슬레이트 섀도", labelEn: "Slate Shadow", role: "shadow", color: { r: 0.2, g: 0.27, b: 0.46 } },
      { id: "ml-acc", labelKo: "코발트 엣지", labelEn: "Cobalt Edge", role: "accent", color: { r: 0.35, g: 0.56, b: 0.96 } },
    ],
  },
];

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
const clampUnitRgb = (c: UnitRgb): UnitRgb => ({ r: clamp(c.r, 0, 1), g: clamp(c.g, 0, 1), b: clamp(c.b, 0, 1) });
const roundTo = (value: number, digits = 3): number => Math.round(value * (10 ** digits)) / (10 ** digits);
const rgbLuma = (c: UnitRgb): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const rgbSaturation = (c: UnitRgb): number => {
  const maxC = Math.max(c.r, c.g, c.b);
  return maxC <= 1e-6 ? 0 : (maxC - Math.min(c.r, c.g, c.b)) / maxC;
};
const mixRgb = (a: UnitRgb, b: UnitRgb, t: number): UnitRgb => {
  const k = clamp(t, 0, 1);
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
};
const formatFloatWgsl = (value: number): string => (Number.isFinite(value) ? value : 0).toFixed(4);
const fract = (x: number): number => x - Math.floor(x);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

const FNV64_OFFSET = BigInt("0xcbf29ce484222325");
const FNV64_PRIME = BigInt("0x100000001b3");
const FNV64_MASK = BigInt("0xffffffffffffffff");

function fnv1a64BytesHex(bytes: Uint8ClampedArray): string {
  let hash = FNV64_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    hash = ((hash ^ BigInt(bytes[i] ?? 0)) * FNV64_PRIME) & FNV64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

interface KeywordRule<T extends string> { readonly kind: T; readonly tokens: readonly string[]; readonly weight: number; }

const STYLE_RULES: readonly KeywordRule<TextureStyleKind>[] = [
  { kind: "watercolor-paper", weight: 3, tokens: ["수채화", "워터컬러", "종이", "한지", "번짐", "물번짐", "watercolor", "paper", "aquarelle", "wash"] },
  { kind: "neon-halftone", weight: 3, tokens: ["사이버펑크", "네온", "하프톤", "망점", "도트", "스캔라인", "cyberpunk", "neon", "halftone", "screentone", "dot"] },
  { kind: "oil-impasto", weight: 3, tokens: ["유화", "임파스토", "두꺼운", "붓터치", "유채", "나이프", "oil", "impasto", "thick", "brushstroke", "relief"] },
  { kind: "cel-2step", weight: 3, tokens: ["셀", "애니메이션", "애니", "2단", "이단", "카툰", "만화", "cel", "anime", "toon", "2-step", "2step", "two-tone"] },
  { kind: "pencil-hatch", weight: 2, tokens: ["연필", "해칭", "크로스해칭", "스케치", "흑연", "pencil", "hatch", "sketch", "graphite"] },
  { kind: "film-grain", weight: 2, tokens: ["필름", "그레인", "아날로그", "레트로", "빈티지", "film", "grain", "analog", "vintage"] },
];

const LIGHTING_RULES: readonly KeywordRule<LightingStyleKind>[] = [
  { kind: "warm-rim", weight: 3, tokens: ["따뜻한", "따뜻", "림라이트", "역광", "노을", "황금", "온기", "warm", "rim", "backlight", "golden", "sunset", "amber"] },
  { kind: "cyber-neon", weight: 3, tokens: ["사이버펑크", "네온", "글로우", "마젠타", "시안", "cyberpunk", "neon", "glow", "synthwave"] },
  { kind: "cel-hard-shadow", weight: 3, tokens: ["2단", "이단", "그림자", "하드", "셀", "애니", "shadow", "2-step", "hard", "cel", "anime"] },
  { kind: "directional-key", weight: 2, tokens: ["유화", "임파스토", "두꺼운", "측광", "입체", "impasto", "oil", "directional", "key", "sculpt"] },
  { kind: "moonlight-backrim", weight: 3, tokens: ["달빛", "차가운", "푸른", "밤", "냉기", "moon", "moonlight", "cold", "cool", "night"] },
  { kind: "soft-ambient", weight: 1, tokens: ["부드러운", "파스텔", "은은한", "확산", "soft", "pastel", "ambient", "diffuse"] },
];

const STYLE_LABELS: Readonly<Record<TextureStyleKind, { readonly ko: string; readonly en: string }>> = {
  "watercolor-paper": { ko: "수채화 종이 질감", en: "Watercolor Paper" },
  "neon-halftone": { ko: "네온 하프톤 망점", en: "Neon Halftone" },
  "oil-impasto": { ko: "유화 두꺼운 임파스토", en: "Thick Oil Impasto" },
  "cel-2step": { ko: "셀 애니메이션 2단 음영", en: "Cel 2-Step Shading" },
  "pencil-hatch": { ko: "연필 크로스해칭", en: "Pencil Cross-Hatch" },
  "film-grain": { ko: "아날로그 필름 그레인", en: "Analog Film Grain" },
  "clean-studio": { ko: "클린 스튜디오 셰이딩", en: "Clean Studio Shading" },
};

const LIGHTING_LABELS: Readonly<Record<LightingStyleKind, { readonly ko: string; readonly en: string }>> = {
  "warm-rim": { ko: "따뜻한 림라이트", en: "Warm Rim Light" },
  "cyber-neon": { ko: "사이버 네온 광원", en: "Cyber Neon Glow" },
  "directional-key": { ko: "입체 방향광", en: "Directional Sculpt Key" },
  "cel-hard-shadow": { ko: "선명한 2단 그림자", en: "Crisp 2-Step Shadow" },
  "moonlight-backrim": { ko: "차가운 달빛 역광", en: "Moonlight Back-Rim" },
  "soft-ambient": { ko: "부드러운 환경광", en: "Soft Ambient Fill" },
};

function defaultPaletteForStyle(style: TextureStyleKind, lighting: LightingStyleKind): {
  keyColor: UnitRgb; rimColor: UnitRgb; shadowColor: UnitRgb; accentColor: UnitRgb;
} {
  if (style === "watercolor-paper") {
    return {
      keyColor: { r: 0.93, g: 0.83, b: 0.72 },
      rimColor: lighting === "moonlight-backrim" ? { r: 0.76, g: 0.9, b: 1.0 } : { r: 1.0, g: 0.84, b: 0.56 },
      shadowColor: { r: 0.44, g: 0.36, b: 0.43 }, accentColor: { r: 0.89, g: 0.54, b: 0.44 },
    };
  }
  if (style === "neon-halftone" || lighting === "cyber-neon") {
    return {
      keyColor: { r: 0.28, g: 0.34, b: 0.74 }, rimColor: { r: 0.14, g: 0.96, b: 0.98 },
      shadowColor: { r: 0.08, g: 0.06, b: 0.2 }, accentColor: { r: 0.98, g: 0.18, b: 0.72 },
    };
  }
  if (style === "oil-impasto") {
    return {
      keyColor: { r: 0.84, g: 0.65, b: 0.44 }, rimColor: { r: 0.99, g: 0.91, b: 0.74 },
      shadowColor: { r: 0.26, g: 0.21, b: 0.24 }, accentColor: { r: 0.76, g: 0.36, b: 0.24 },
    };
  }
  if (style === "cel-2step" || lighting === "cel-hard-shadow") {
    return {
      keyColor: { r: 0.88, g: 0.82, b: 0.78 },
      rimColor: lighting === "warm-rim" ? { r: 1.0, g: 0.88, b: 0.66 } : { r: 0.84, g: 0.94, b: 1.0 },
      shadowColor: { r: 0.28, g: 0.31, b: 0.52 }, accentColor: { r: 0.92, g: 0.42, b: 0.46 },
    };
  }
  if (style === "pencil-hatch") {
    return {
      keyColor: { r: 0.92, g: 0.9, b: 0.86 }, rimColor: { r: 0.98, g: 0.96, b: 0.91 },
      shadowColor: { r: 0.24, g: 0.24, b: 0.27 }, accentColor: { r: 0.52, g: 0.48, b: 0.44 },
    };
  }
  return {
    keyColor: { r: 0.84, g: 0.82, b: 0.8 },
    rimColor: lighting === "warm-rim" ? { r: 1.0, g: 0.86, b: 0.62 } : { r: 0.88, g: 0.93, b: 0.99 },
    shadowColor: { r: 0.24, g: 0.26, b: 0.34 }, accentColor: { r: 0.62, g: 0.58, b: 0.78 },
  };
}

function matchBestRule<T extends string>(
  normalized: string,
  rules: readonly KeywordRule<T>[],
  fallback: T,
  matchedKeywords: string[],
): { readonly kind: T; readonly score: number } {
  let best = fallback;
  let bestScore = 0;
  for (const rule of rules) {
    let score = 0;
    for (const token of rule.tokens) {
      if (normalized.includes(token)) {
        score += rule.weight;
        if (!matchedKeywords.includes(token)) matchedKeywords.push(token);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.kind;
    }
  }
  return { kind: best, score: bestScore };
}

/** 자연어(한글/영문) 질감·조명 프롬프트와 레퍼런스 컬러 스와치를 결정론적 셰이더 레시피로 해석한다. */
export function parseNoCodeShaderPrompt(input: NoCodeShaderPromptInput = {}): ParsedNoCodeShaderRecipe {
  const prompt = (input.prompt ?? "").trim();
  const normalized = prompt.toLowerCase();
  const swatches = input.swatches ?? [];
  const matchedKeywords: string[] = [];

  const styleMatch = matchBestRule(normalized, STYLE_RULES, "clean-studio", matchedKeywords);
  const lightingMatch = matchBestRule(normalized, LIGHTING_RULES, "soft-ambient", matchedKeywords);
  let bestStyle: TextureStyleKind = styleMatch.kind;
  let bestLighting: LightingStyleKind = lightingMatch.kind;

  if (lightingMatch.score === 0) {
    if (bestStyle === "watercolor-paper") bestLighting = "warm-rim";
    else if (bestStyle === "neon-halftone") bestLighting = "cyber-neon";
    else if (bestStyle === "oil-impasto") bestLighting = "directional-key";
    else if (bestStyle === "cel-2step") bestLighting = "cel-hard-shadow";
  }

  let { keyColor, rimColor, shadowColor, accentColor } = defaultPaletteForStyle(bestStyle, bestLighting);

  if (swatches.length > 0) {
    const byRole = new Map<SwatchColorRole, UnitRgb>();
    for (const swatch of swatches) {
      if (!byRole.has(swatch.role)) byRole.set(swatch.role, clampUnitRgb(swatch.color));
    }
    const sortedByLuma = [...swatches].map((s) => clampUnitRgb(s.color)).sort((a, b) => rgbLuma(a) - rgbLuma(b));
    const mostSaturated = [...swatches].map((s) => clampUnitRgb(s.color)).sort((a, b) => rgbSaturation(b) - rgbSaturation(a))[0];
    shadowColor = byRole.get("shadow") ?? sortedByLuma[0] ?? shadowColor;
    rimColor = byRole.get("rim") ?? sortedByLuma[sortedByLuma.length - 1] ?? rimColor;
    keyColor = byRole.get("key") ?? sortedByLuma[Math.floor(sortedByLuma.length / 2)] ?? keyColor;
    accentColor = byRole.get("accent") ?? mostSaturated ?? accentColor;

    if (prompt.length === 0) {
      if (rgbSaturation(rimColor) > 0.72 && rgbSaturation(accentColor) > 0.65) {
        bestStyle = "neon-halftone";
        bestLighting = "cyber-neon";
      } else if (rimColor.r - rimColor.b > 0.16) {
        bestStyle = "watercolor-paper";
        bestLighting = "warm-rim";
      } else {
        bestStyle = "cel-2step";
        bestLighting = "moonlight-backrim";
      }
    }
  }

  const hasRimHint = normalized.includes("림") || normalized.includes("역광") || normalized.includes("rim") || normalized.includes("back");
  const hasThickHint = normalized.includes("두꺼") || normalized.includes("강한") || normalized.includes("thick") || normalized.includes("heavy");
  const intensity = clamp(input.intensity ?? 1.0, 0.2, 1.5);
  const rimBase = bestLighting === "warm-rim" || bestLighting === "cyber-neon" || bestLighting === "moonlight-backrim" ? 0.78 : 0.42;
  const rimStrength = clamp(rimBase + (hasRimHint ? 0.24 : 0), 0.15, 1.35);
  const shadowFloor = bestStyle === "cel-2step" ? 0.22 : bestStyle === "neon-halftone" ? 0.12 : 0.28;
  const saturationBoost = bestStyle === "neon-halftone" ? 0.34 : bestStyle === "oil-impasto" ? 0.18 : bestStyle === "watercolor-paper" ? 0.08 : 0.12;
  const grainScale = bestStyle === "watercolor-paper" ? 28.0 : bestStyle === "film-grain" ? 64.0 : bestStyle === "pencil-hatch" ? 36.0 : 18.0;
  const patternParam = bestStyle === "neon-halftone" ? 14.0 : bestStyle === "cel-2step" ? 2.0 : bestStyle === "oil-impasto" ? 11.0 : 6.0;
  const reliefStrength = clamp((bestStyle === "oil-impasto" ? 0.88 : bestStyle === "watercolor-paper" ? 0.42 : 0.24) + (hasThickHint ? 0.25 : 0), 0.1, 1.4);
  const seedNorm = (Math.abs(Math.trunc(input.seed ?? 1337)) % 10000) / 10000;
  const inputMode: ParsedNoCodeShaderRecipe["inputMode"] =
    prompt.length > 0 && swatches.length > 0 ? "hybrid" : prompt.length > 0 ? "prompt" : swatches.length > 0 ? "swatches" : "default";
  const sLabel = STYLE_LABELS[bestStyle];
  const lLabel = LIGHTING_LABELS[bestLighting];

  return {
    prompt, inputMode, style: bestStyle, lighting: bestLighting, matchedKeywords,
    summaryKo: `${sLabel.ko} · ${lLabel.ko}${swatches.length > 0 ? ` · 스와치 ${swatches.length}색 반영` : ""}`,
    summaryEn: `${sLabel.en} · ${lLabel.en}${swatches.length > 0 ? ` · ${swatches.length} swatch tones` : ""}`,
    uniforms: {
      styleId: STYLE_IDS[bestStyle], lightingId: LIGHTING_IDS[bestLighting],
      keyColor: clampUnitRgb(keyColor), rimColor: clampUnitRgb(rimColor),
      shadowColor: clampUnitRgb(shadowColor), accentColor: clampUnitRgb(accentColor),
      intensity: roundTo(intensity, 3), rimStrength: roundTo(rimStrength, 3),
      shadowFloor: roundTo(shadowFloor, 3), saturationBoost: roundTo(saturationBoost, 3),
      grainScale: roundTo(grainScale, 2), patternParam: roundTo(patternParam, 2),
      reliefStrength: roundTo(reliefStrength, 3), seedNorm: roundTo(seedNorm, 4),
      uniformByteLength: NOCODE_SHADER_UNIFORM_BYTES,
    },
  };
}

/** 16바이트 정렬 GPU uniform 버퍼(96바이트 = 24 words)로 직렬화한다. */
export function packNoCodeUniformBuffer(uniforms: NoCodeShaderUniformSpec, width: number, height: number): Uint32Array {
  const buffer = new ArrayBuffer(NOCODE_SHADER_UNIFORM_BYTES);
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  u32[0] = Math.max(1, Math.trunc(width));
  u32[1] = Math.max(1, Math.trunc(height));
  u32[2] = uniforms.styleId >>> 0;
  u32[3] = uniforms.lightingId >>> 0;
  f32.set([
    uniforms.keyColor.r, uniforms.keyColor.g, uniforms.keyColor.b, uniforms.intensity,
    uniforms.rimColor.r, uniforms.rimColor.g, uniforms.rimColor.b, uniforms.rimStrength,
    uniforms.shadowColor.r, uniforms.shadowColor.g, uniforms.shadowColor.b, uniforms.shadowFloor,
    uniforms.accentColor.r, uniforms.accentColor.g, uniforms.accentColor.b, uniforms.saturationBoost,
    uniforms.grainScale, uniforms.patternParam, uniforms.reliefStrength, uniforms.seedNorm,
  ], 4);
  return u32;
}

function buildSharedWgslBody(recipe: ParsedNoCodeShaderRecipe): string {
  const u = recipe.uniforms;
  return /* wgsl */ `// Generated by ToonStudio No-Code WGSL Shader Builder
// Style: ${recipe.style} | Lighting: ${recipe.lighting} | Mode: ${recipe.inputMode}
struct NoCodeShaderUniforms {
  dims_mode: vec4<u32>,
  key_color: vec4<f32>,
  rim_color: vec4<f32>,
  shadow_color: vec4<f32>,
  accent_color: vec4<f32>,
  surface_params: vec4<f32>,
}

fn hash21(p: vec2<f32>) -> f32 {
  let q = fract(p * vec2<f32>(123.34, 456.21));
  let d = dot(q, q + vec2<f32>(45.32));
  return fract((q.x + d) * (q.y + d));
}

fn value_noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), u.x),
    mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), u.x),
    u.y,
  );
}

fn eval_nocode_surface(src: vec4<f32>, uv: vec2<f32>, p: NoCodeShaderUniforms) -> vec4<f32> {
  let luma = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let radial = clamp(length(uv * 2.0 - vec2<f32>(1.0)), 0.0, 1.0);
  let rim_mask = pow(clamp(radial * 0.92 + (1.0 - abs(luma - 0.52)) * 0.18, 0.0, 1.0), 2.4) * p.rim_color.w;
  let grain_freq = max(p.surface_params.x, ${formatFloatWgsl(u.grainScale)});
  let n1 = value_noise(uv * grain_freq + vec2<f32>(p.surface_params.w * 19.0));
  let n2 = value_noise(uv * (grain_freq * 2.13) + vec2<f32>(7.3, 13.1));
  let paper_grain = (n1 * 0.65 + n2 * 0.35) - 0.5;
  var out_rgb = mix(p.shadow_color.rgb, src.rgb * p.key_color.rgb * 1.18, clamp(luma + p.shadow_color.w * 0.35, 0.0, 1.0));
  let style_id = p.dims_mode.z;

  if (style_id == 1u) {
    let wet_edge = smoothstep(0.18, 0.78, abs(n1 - n2) * 2.4);
    out_rgb = mix(out_rgb, p.accent_color.rgb * 0.78, wet_edge * 0.22) + vec3<f32>(paper_grain * 0.14 * p.surface_params.z) + p.rim_color.rgb * rim_mask * 0.55;
  } else if (style_id == 2u) {
    let cell = fract(uv * max(p.surface_params.y, 8.0)) - vec2<f32>(0.5);
    let dot_r = clamp(0.46 - luma * 0.34, 0.08, 0.44);
    let dot_mask = 1.0 - smoothstep(dot_r - 0.06, dot_r + 0.06, length(cell));
    let neon_tint = mix(p.accent_color.rgb, p.rim_color.rgb, clamp(uv.x * 0.7 + rim_mask * 0.5, 0.0, 1.0));
    out_rgb = mix(out_rgb * 0.72, neon_tint, dot_mask * 0.52) + p.rim_color.rgb * rim_mask * 0.65;
  } else if (style_id == 3u) {
    let relief = (sin((uv.x * 26.0 + uv.y * 14.0) + n1 * 4.2) * 0.6 + cos((uv.y * 22.0 - uv.x * 9.0) + n2 * 3.6) * 0.4) * p.surface_params.z;
    let spec = pow(clamp(0.55 + relief * 0.48, 0.0, 1.0), 6.0) * 0.32;
    out_rgb = out_rgb * (1.0 + relief * 0.22) + p.rim_color.rgb * (spec + rim_mask * 0.28);
  } else if (style_id == 4u) {
    let band = select(select(0.32, 0.72, luma >= 0.36), 1.0, luma >= 0.72);
    let cel_base = mix(p.shadow_color.rgb, p.key_color.rgb * (0.48 + src.rgb * 0.62), band);
    out_rgb = cel_base + p.rim_color.rgb * smoothstep(0.54, 0.62, rim_mask) * 0.46;
  } else if (style_id == 5u) {
    let hatch_a = smoothstep(0.35, 0.65, sin((uv.x + uv.y) * 95.0));
    let hatch_b = smoothstep(0.35, 0.65, sin((uv.x - uv.y) * 95.0));
    out_rgb = out_rgb * mix(1.0, 0.66 + 0.34 * hatch_a * hatch_b, clamp(1.0 - luma, 0.0, 1.0)) + vec3<f32>(paper_grain * 0.08);
  } else if (style_id == 6u) {
    out_rgb = smoothstep(vec3<f32>(0.02), vec3<f32>(0.98), out_rgb) + vec3<f32>((n2 - 0.5) * 0.16) + p.rim_color.rgb * rim_mask * 0.22;
  } else {
    out_rgb = out_rgb + p.rim_color.rgb * rim_mask * 0.34;
  }

  let sat_luma = dot(out_rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let graded = mix(vec3<f32>(sat_luma), out_rgb, 1.0 + p.accent_color.w);
  let final_rgb = clamp(mix(src.rgb, graded, clamp(p.key_color.w, 0.0, 1.0)), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(final_rgb, src.a);
}
`;
}

/** 실제 유효 `@compute @workgroup_size(16, 16, 1)` WGSL 셰이더 소스 생성. */
export function generateNoCodeComputeWgsl(recipe: ParsedNoCodeShaderRecipe): string {
  return /* wgsl */ `${buildSharedWgslBody(recipe)}
@group(0) @binding(0) var<uniform> params: NoCodeShaderUniforms;
@group(0) @binding(1) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> out_pixels: array<u32>;

fn unpack_rgba8(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 0xffu) / 255.0, f32((packed >> 8u) & 0xffu) / 255.0,
    f32((packed >> 16u) & 0xffu) / 255.0, f32((packed >> 24u) & 0xffu) / 255.0,
  );
}

fn pack_rgba8(c: vec4<f32>) -> u32 {
  let r = u32(round(clamp(c.r, 0.0, 1.0) * 255.0));
  let g = u32(round(clamp(c.g, 0.0, 1.0) * 255.0));
  let b = u32(round(clamp(c.b, 0.0, 1.0) * 255.0));
  let a = u32(round(clamp(c.a, 0.0, 1.0) * 255.0));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.dims_mode.x || gid.y >= params.dims_mode.y) { return; }
  let idx = gid.y * params.dims_mode.x + gid.x;
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) / vec2<f32>(f32(params.dims_mode.x), f32(params.dims_mode.y));
  out_pixels[idx] = pack_rgba8(eval_nocode_surface(unpack_rgba8(src_pixels[idx]), uv, params));
}
`;
}

/** 실제 유효 `@vertex` + `@fragment` WGSL 셰이더 소스 생성. */
export function generateNoCodeFragmentWgsl(recipe: ParsedNoCodeShaderRecipe): string {
  return /* wgsl */ `${buildSharedWgslBody(recipe)}
struct VertexOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, }

@group(0) @binding(0) var<uniform> params: NoCodeShaderUniforms;
@group(0) @binding(1) var src_sampler: sampler;
@group(0) @binding(2) var src_tex: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out_v: VertexOut;
  let p = positions[vid];
  out_v.pos = vec4<f32>(p, 0.0, 1.0);
  out_v.uv = p * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out_v;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  return eval_nocode_surface(textureSample(src_tex, src_sampler, in.uv), in.uv, params);
}
`;
}

/** 생성된 WGSL 소스의 구조·진입점·바인딩·괄호 균형·수치 무결성을 정적 검증한다. */
export function validateGeneratedWgsl(source: string, stage: ShaderStageMode): WgslValidationResult {
  const errors: string[] = [];
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0) errors.push("Unmatched closing brace '}'");
    if (parenDepth < 0) errors.push("Unmatched closing paren ')'");
  }
  if (braceDepth !== 0) errors.push(`Unbalanced braces (depth=${braceDepth})`);
  if (parenDepth !== 0) errors.push(`Unbalanced parentheses (depth=${parenDepth})`);
  if (!source.includes("struct NoCodeShaderUniforms")) errors.push("Missing NoCodeShaderUniforms struct");
  if (/\b(?:NaN|Infinity|undefined)\b/.test(source)) errors.push("Contains invalid non-finite literal");

  const bindings = source.match(/@group\(\d+\)\s*@binding\(\d+\)/g) ?? [];
  if (bindings.length < 3) errors.push(`Expected >= 3 bindings, got ${bindings.length}`);

  let entryPoint = "main";
  if (stage === "compute") {
    if (!/@compute\s+@workgroup_size\(\s*\d+\s*,\s*\d+/.test(source)) errors.push("Missing @compute @workgroup_size attribute");
    if (!/fn\s+main\s*\(/.test(source)) errors.push("Missing compute entry point fn main");
  } else {
    entryPoint = "fs_main";
    if (!source.includes("@fragment")) errors.push("Missing @fragment attribute");
    if (!/fn\s+fs_main\s*\(/.test(source)) errors.push("Missing fragment entry point fn fs_main");
    if (!source.includes("@vertex")) errors.push("Missing @vertex companion stage");
  }

  return {
    valid: errors.length === 0, errors, stage, entryPoint,
    lineCount: source.trim().split("\n").length,
    bindingCount: bindings.length, uniformByteLength: NOCODE_SHADER_UNIFORM_BYTES,
  };
}

function hash21Cpu(px: number, py: number): number {
  const qx = fract(px * 123.34);
  const qy = fract(py * 456.21);
  const d = qx * (qx + 45.32) + qy * (qy + 45.32);
  return fract((qx + d) * (qy + d));
}

function valueNoiseCpu(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash21Cpu(ix, iy);
  const b = hash21Cpu(ix + 1, iy);
  const c = hash21Cpu(ix, iy + 1);
  const d = hash21Cpu(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}

/** 프리뷰용 결정론적 3D 구체 + 아틀리에 배경 기본 RGBA 버퍼를 생성한다. */
export function createStudioPreviewBaseRgba(width: number, height: number): Uint8ClampedArray {
  const w = Math.max(8, Math.min(256, Math.trunc(width)));
  const h = Math.max(8, Math.min(256, Math.trunc(height)));
  const out = new Uint8ClampedArray(w * h * 4);
  const radius = Math.sqrt(0.62);
  for (let y = 0; y < h; y += 1) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      const u = (x + 0.5) / w;
      const cx = (u - 0.5) * 2.0;
      const cy = (v - 0.5) * 2.0;
      const r2 = cx * cx + cy * cy;
      let r: number;
      let g: number;
      let b: number;
      if (r2 <= 0.62) {
        const nz = Math.sqrt(Math.max(0, 0.62 - r2)) / radius;
        const fill = 0.24 + clamp((cx / radius) * -0.45 + (cy / radius) * -0.52 + nz * 0.72, 0, 1) * 0.74;
        r = clamp(fill * 0.96, 0, 1);
        g = clamp(fill * 0.87, 0, 1);
        b = clamp(fill * 0.81, 0, 1);
      } else {
        const bgGrad = 0.24 + (1 - v) * 0.32 + Math.sin(u * 4.2) * 0.04;
        r = clamp(bgGrad * 0.86, 0, 1);
        g = clamp(bgGrad * 0.88, 0, 1);
        b = clamp(bgGrad * 0.94, 0, 1);
      }
      const idx = (y * w + x) * 4;
      out[idx] = Math.round(r * 255);
      out[idx + 1] = Math.round(g * 255);
      out[idx + 2] = Math.round(b * 255);
      out[idx + 3] = 255;
    }
  }
  return out;
}

function evalStylePixelCpu(
  u: NoCodeShaderUniformSpec,
  src: UnitRgb,
  uu: number,
  v: number,
  luma: number,
  rimMask: number,
  n1: number,
  n2: number,
  paperGrain: number,
): UnitRgb {
  const litFactor = clamp(luma + u.shadowFloor * 0.35, 0, 1);
  let outRgb = mixRgb(u.shadowColor, { r: src.r * u.keyColor.r * 1.18, g: src.g * u.keyColor.g * 1.18, b: src.b * u.keyColor.b * 1.18 }, litFactor);

  if (u.styleId === 1) {
    const wetEdge = smoothstep(0.18, 0.78, Math.abs(n1 - n2) * 2.4);
    outRgb = mixRgb(outRgb, { r: u.accentColor.r * 0.78, g: u.accentColor.g * 0.78, b: u.accentColor.b * 0.78 }, wetEdge * 0.22);
    const grainAdd = paperGrain * 0.14 * u.reliefStrength;
    return {
      r: outRgb.r + grainAdd + u.rimColor.r * rimMask * 0.55,
      g: outRgb.g + grainAdd + u.rimColor.g * rimMask * 0.55,
      b: outRgb.b + grainAdd + u.rimColor.b * rimMask * 0.55,
    };
  }
  if (u.styleId === 2) {
    const dotFreq = Math.max(u.patternParam, 8);
    const dotR = clamp(0.46 - luma * 0.34, 0.08, 0.44);
    const dotMask = 1 - smoothstep(dotR - 0.06, dotR + 0.06, Math.hypot(fract(uu * dotFreq) - 0.5, fract(v * dotFreq) - 0.5));
    const neonTint = mixRgb(u.accentColor, u.rimColor, clamp(uu * 0.7 + rimMask * 0.5, 0, 1));
    const dotted = mixRgb({ r: outRgb.r * 0.72, g: outRgb.g * 0.72, b: outRgb.b * 0.72 }, neonTint, dotMask * 0.52);
    return { r: dotted.r + u.rimColor.r * rimMask * 0.65, g: dotted.g + u.rimColor.g * rimMask * 0.65, b: dotted.b + u.rimColor.b * rimMask * 0.65 };
  }
  if (u.styleId === 3) {
    const relief = (Math.sin(uu * 26 + v * 14 + n1 * 4.2) * 0.6 + Math.cos(v * 22 - uu * 9 + n2 * 3.6) * 0.4) * u.reliefStrength;
    const spec = (clamp(0.55 + relief * 0.48, 0, 1) ** 6) * 0.32;
    return {
      r: outRgb.r * (1 + relief * 0.22) + u.rimColor.r * (spec + rimMask * 0.28),
      g: outRgb.g * (1 + relief * 0.22) + u.rimColor.g * (spec + rimMask * 0.28),
      b: outRgb.b * (1 + relief * 0.22) + u.rimColor.b * (spec + rimMask * 0.28),
    };
  }
  if (u.styleId === 4) {
    const band = luma >= 0.72 ? 1.0 : luma >= 0.36 ? 0.72 : 0.32;
    const cel = mixRgb(u.shadowColor, { r: u.keyColor.r * (0.48 + src.r * 0.62), g: u.keyColor.g * (0.48 + src.g * 0.62), b: u.keyColor.b * (0.48 + src.b * 0.62) }, band);
    const hardRim = smoothstep(0.54, 0.62, rimMask) * 0.46;
    return { r: cel.r + u.rimColor.r * hardRim, g: cel.g + u.rimColor.g * hardRim, b: cel.b + u.rimColor.b * hardRim };
  }
  if (u.styleId === 5) {
    const hatchA = smoothstep(0.35, 0.65, Math.sin((uu + v) * 95));
    const hatchB = smoothstep(0.35, 0.65, Math.sin((uu - v) * 95));
    const darkFactor = 1 + ((0.66 + 0.34 * hatchA * hatchB) - 1) * clamp(1 - luma, 0, 1);
    return { r: outRgb.r * darkFactor + paperGrain * 0.08, g: outRgb.g * darkFactor + paperGrain * 0.08, b: outRgb.b * darkFactor + paperGrain * 0.08 };
  }
  if (u.styleId === 6) {
    const film = (n2 - 0.5) * 0.16;
    return {
      r: smoothstep(0.02, 0.98, outRgb.r) + film + u.rimColor.r * rimMask * 0.22,
      g: smoothstep(0.02, 0.98, outRgb.g) + film + u.rimColor.g * rimMask * 0.22,
      b: smoothstep(0.02, 0.98, outRgb.b) + film + u.rimColor.b * rimMask * 0.22,
    };
  }
  return { r: outRgb.r + u.rimColor.r * rimMask * 0.34, g: outRgb.g + u.rimColor.g * rimMask * 0.34, b: outRgb.b + u.rimColor.b * rimMask * 0.34 };
}

/** WGSL `eval_nocode_surface`와 동일한 수학으로 결정론적 CPU 프리뷰 RGBA 버퍼를 생성한다. */
export function renderNoCodeShaderCpuPreview(
  recipe: ParsedNoCodeShaderRecipe,
  options: { readonly width?: number; readonly height?: number; readonly sourceRgba?: Uint8ClampedArray } = {},
): NoCodeShaderCpuPreview {
  const started = performance.now();
  const width = Math.max(8, Math.min(256, Math.trunc(options.width ?? 48)));
  const height = Math.max(8, Math.min(256, Math.trunc(options.height ?? 48)));
  const expectedLen = width * height * 4;
  const src = options.sourceRgba && options.sourceRgba.length === expectedLen
    ? options.sourceRgba
    : createStudioPreviewBaseRgba(width, height);
  const rgba = new Uint8ClampedArray(expectedLen);
  const u = recipe.uniforms;
  const pixelCount = width * height;
  const gridAccum = new Float64Array(64);
  const gridCounts = new Uint32Array(64);
  let sumLuma = 0;
  let sumLumaSq = 0;
  let sumSat = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let rimHits = 0;

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const gy = Math.min(7, Math.floor((y * 8) / height));
    for (let x = 0; x < width; x += 1) {
      const uu = (x + 0.5) / width;
      const gx = Math.min(7, Math.floor((x * 8) / width));
      const idx = (y * width + x) * 4;
      const srcRgb: UnitRgb = { r: (src[idx] ?? 0) / 255, g: (src[idx + 1] ?? 0) / 255, b: (src[idx + 2] ?? 0) / 255 };
      const sa = (src[idx + 3] ?? 255) / 255;
      const luma = rgbLuma(srcRgb);
      const radial = clamp(Math.hypot(uu * 2 - 1, v * 2 - 1), 0, 1);
      const rimMask = (clamp(radial * 0.92 + (1 - Math.abs(luma - 0.52)) * 0.18, 0, 1) ** 2.4) * u.rimStrength;
      if (rimMask > 0.35) rimHits += 1;

      const n1 = valueNoiseCpu(uu * u.grainScale + u.seedNorm * 19, v * u.grainScale + u.seedNorm * 19);
      const n2 = valueNoiseCpu(uu * u.grainScale * 2.13 + 7.3, v * u.grainScale * 2.13 + 13.1);
      const outRgb = evalStylePixelCpu(u, srcRgb, uu, v, luma, rimMask, n1, n2, (n1 * 0.65 + n2 * 0.35) - 0.5);
      const satLuma = rgbLuma(outRgb);
      const satScale = 1 + u.saturationBoost;
      const mixAmt = clamp(u.intensity, 0, 1);
      const fr = clamp(srcRgb.r + ((satLuma + (outRgb.r - satLuma) * satScale) - srcRgb.r) * mixAmt, 0, 1);
      const fg = clamp(srcRgb.g + ((satLuma + (outRgb.g - satLuma) * satScale) - srcRgb.g) * mixAmt, 0, 1);
      const fb = clamp(srcRgb.b + ((satLuma + (outRgb.b - satLuma) * satScale) - srcRgb.b) * mixAmt, 0, 1);

      rgba[idx] = Math.round(fr * 255);
      rgba[idx + 1] = Math.round(fg * 255);
      rgba[idx + 2] = Math.round(fb * 255);
      rgba[idx + 3] = Math.round(clamp(sa, 0, 1) * 255);

      const finalLuma = 0.2126 * fr + 0.7152 * fg + 0.0722 * fb;
      sumLuma += finalLuma;
      sumLumaSq += finalLuma * finalLuma;
      sumSat += rgbSaturation({ r: fr, g: fg, b: fb });
      sumR += fr;
      sumG += fg;
      sumB += fb;
      const cellIdx = gy * 8 + gx;
      gridAccum[cellIdx] = (gridAccum[cellIdx] ?? 0) + finalLuma;
      gridCounts[cellIdx] = (gridCounts[cellIdx] ?? 0) + 1;
    }
  }

  const meanLuma = sumLuma / pixelCount;
  const lumaGrid8x8: number[] = [];
  for (let i = 0; i < 64; i += 1) {
    lumaGrid8x8.push(roundTo((gridAccum[i] ?? 0) / Math.max(1, gridCounts[i] ?? 1), 3));
  }
  return {
    width, height, rgba, digestHex: fnv1a64BytesHex(rgba), lumaGrid8x8,
    stats: {
      meanLuma: roundTo(meanLuma, 3),
      contrastStdDev: roundTo(Math.sqrt(Math.max(0, sumLumaSq / pixelCount - meanLuma * meanLuma)), 3),
      meanSaturation: roundTo(sumSat / pixelCount, 3),
      rimPixelRatio: roundTo(rimHits / pixelCount, 3),
      dominantRgb: { r: roundTo(sumR / pixelCount, 3), g: roundTo(sumG / pixelCount, 3), b: roundTo(sumB / pixelCount, 3) },
      elapsedMs: roundTo(Math.max(0.01, performance.now() - started), 2),
    },
  };
}

/** 노코드 자연어 프롬프트 또는 컬러 스와치로부터 `@compute`·`@fragment` WGSL과 결정론적 CPU 프리뷰를 일괄 빌드한다. */
export function buildNoCodeWgslShader(input: NoCodeShaderPromptInput = {}): BuiltNoCodeShaderBundle {
  const targetStage: ShaderStageMode = input.targetStage ?? "compute";
  const width = Math.max(8, Math.min(256, Math.trunc(input.previewWidth ?? 48)));
  const height = Math.max(8, Math.min(256, Math.trunc(input.previewHeight ?? 48)));
  const recipe = parseNoCodeShaderPrompt(input);
  const computeWgsl = generateNoCodeComputeWgsl(recipe);
  const fragmentWgsl = generateNoCodeFragmentWgsl(recipe);
  return {
    recipe, targetStage,
    primaryWgsl: targetStage === "compute" ? computeWgsl : fragmentWgsl,
    computeWgsl, fragmentWgsl,
    computeValidation: validateGeneratedWgsl(computeWgsl, "compute"),
    fragmentValidation: validateGeneratedWgsl(fragmentWgsl, "fragment"),
    uniformBufferWords: packNoCodeUniformBuffer(recipe.uniforms, width, height),
    preview: renderNoCodeShaderCpuPreview(recipe, { width, height, sourceRgba: input.sourceRgba }),
  };
}
