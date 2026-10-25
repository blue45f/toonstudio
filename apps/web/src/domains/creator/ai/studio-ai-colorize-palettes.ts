/**
 * studio-ai-colorize-palettes.ts — 채색 팔레트 프리셋 (순수 모듈, fetch 없음).
 *
 * 기존 프롬프트 프리셋(STUDIO_AI_COLORIZE_PRESETS)이 "화풍·질감" 축이라면,
 * 이 모듈은 "색감" 축이다. 팔레트를 고르면 색감 문장이 프롬프트에 덧붙고,
 * 스와치 색상은 패널에서 미리보기 점으로만 쓴다. 서버·모델 호출은 없다.
 */

export interface StudioAiColorizePalette {
  readonly id: string;
  readonly label: string;
  readonly fragment: string;
  readonly swatches: readonly string[];
}

export const STUDIO_AI_COLORIZE_PROMPT_MAX = 300;

export const STUDIO_AI_COLORIZE_PALETTES: readonly StudioAiColorizePalette[] =
  Object.freeze([
    Object.freeze({
      id: "pastel",
      label: "파스텔",
      fragment: "파스텔 팔레트, 부드러운 채도",
      swatches: Object.freeze(["#ffd6e8", "#cfe8ff", "#fff3bf", "#d3f9d8"]),
    }),
    Object.freeze({
      id: "vivid",
      label: "선명",
      fragment: "선명한 원색 팔레트, 높은 채도",
      swatches: Object.freeze(["#ff6b6b", "#339af0", "#ffd43b", "#51cf66"]),
    }),
    Object.freeze({
      id: "night",
      label: "야간",
      fragment: "야간 팔레트, 어두운 배경과 은은한 강조색",
      swatches: Object.freeze(["#1e1e2e", "#343a5e", "#748ffc", "#e7f5ff"]),
    }),
    Object.freeze({
      id: "warm",
      label: "노을",
      fragment: "따뜻한 노을 팔레트, 주황·분홍 계열",
      swatches: Object.freeze(["#ff922b", "#f783ac", "#ffd8a8", "#fff4e6"]),
    }),
    Object.freeze({
      id: "mono-accent",
      label: "단색+강조",
      fragment: "단색 계열에 한 가지 강조색만 사용",
      swatches: Object.freeze(["#343a40", "#868e96", "#f1f3f5", "#fa5252"]),
    }),
  ]);

export function findColorizePalette(
  paletteId: string,
): StudioAiColorizePalette | null {
  return (
    STUDIO_AI_COLORIZE_PALETTES.find((palette) => palette.id === paletteId) ??
    null
  );
}

/**
 * 기본 프롬프트에 팔레트 색감 문장을 덧붙인다. 이미 들어 있으면 그대로 두고,
 * 상한을 넘기면 팔레트 문장을 붙이지 않는다(기본 프롬프트를 지킨다).
 */
export function applyColorizePalettePrompt(
  basePrompt: string,
  paletteId: string,
): string {
  const base = basePrompt.trim();
  const palette = findColorizePalette(paletteId);
  if (!palette || base.includes(palette.fragment)) {
    return base.slice(0, STUDIO_AI_COLORIZE_PROMPT_MAX);
  }
  const candidate = [base, palette.fragment].filter(Boolean).join(", ");
  if (candidate.length > STUDIO_AI_COLORIZE_PROMPT_MAX) return base;
  return candidate;
}
