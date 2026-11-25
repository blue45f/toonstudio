import type { BalloonTypesetOptions } from "./korean-balloon-typesetter";
import type { SfxVectorOptions } from "./sfx-vector-path-generator";

export const MAX_DIALOGUE_LENGTH = 1024;
export const MAX_DIALOGUE_TOKENS = 128;
export const MAX_SFX_LENGTH = 128;

/** 원문을 자르지 않고 계산 전에 예제의 지원 범위를 확인한다. */
export function assertLetteringText(text: string, maxLength: number): void {
  if (text.length > maxLength) throw new RangeError(`계산 한도 ${maxLength}자를 넘었습니다. 원문은 유지되며 미계산 상태입니다.`);
}

export function assertTokenBudget(count: number): void {
  if (count > MAX_DIALOGUE_TOKENS) throw new RangeError(`어절 계산 한도 ${MAX_DIALOGUE_TOKENS}개를 넘었습니다. 원문은 유지됩니다.`);
}

function assertFiniteOptions(options: object): void {
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new RangeError(`${key}: 유한한 값이 필요합니다.`);
  }
}

export function assertBalloonInput(text: string, options?: BalloonTypesetOptions): void {
  assertLetteringText(text, MAX_DIALOGUE_LENGTH);
  assertTokenBudget(text.trim() ? text.trim().split(/\s+/u).length : 0);
  assertFiniteOptions(options ?? {});
  if (options?.shape !== undefined && !["oval", "burst", "whisper", "thought", "caption"].includes(options.shape)) throw new RangeError("지원하지 않는 말풍선 도형입니다.");
  if (options?.writingMode !== undefined && !["horizontal-tb", "vertical-rl"].includes(options.writingMode)) throw new RangeError("지원하지 않는 쓰기 방향입니다.");
}

export function assertSfxInput(text: string, options?: SfxVectorOptions): void {
  assertLetteringText(text, MAX_SFX_LENGTH);
  assertFiniteOptions(options ?? {});
  if (options?.envelopeId !== undefined && !["impact-burst", "tremble-whisper", "metallic-slash", "soft-heartbeat", "comic-zoom"].includes(options.envelopeId)) throw new RangeError("지원하지 않는 SFX 예제입니다.");
}

/** 자모·결합 이모지를 표시할 때만 묶으며 반환하는 원문은 바꾸지 않는다. */
export function segmentTextGraphemes(text: string): readonly string[] {
  return Array.from(new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text), (part) => part.segment);
}

export function segmentSfxGraphemes(text: string): readonly string[] {
  return segmentTextGraphemes(text).map((part) => part.normalize("NFC"));
}
