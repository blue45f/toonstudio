/**
 * studio-ai-context-prompt.ts — 맥락 노트·힌트·팔레트 프롬프트 합성 (순수 모듈, fetch 없음).
 *
 * 맥락 노트(studio-ai-context-note.ts)는 표시·프롬프트 컨텍스트 컴파일까지만
 * 있고 채색 프롬프트 합성은 호출부의 몫이었다. 이 모듈은 기본 프롬프트에
 * 맥락·힌트·팔레트 문장을 한 번에 합성한다. 우선순위는 기본 프롬프트 >
 * 맥락 > 힌트 > 팔레트이며, 이미 들어 있는 문장은 중복 추가하지 않고,
 * 상한(채색 패널 입력 상한과 같은 300자)을 넘기면 뒤쪽부터 뺀다.
 */

import type { StudioAiContextNote } from "./studio-ai-context-note";
import { contextNoteToPromptContext } from "./studio-ai-context-note";

export const STUDIO_AI_CONTEXT_PROMPT_MAX = 300;

export interface StudioAiContextPromptInput {
  readonly basePrompt: string;
  readonly note?: StudioAiContextNote | null;
  readonly hintFragments?: readonly string[];
  readonly palettePhrase?: string | null;
}

/** 문장을 합성한다. 기본 프롬프트는 상한 안에서는 항상 지킨다. */
export function composeColorizeContextPrompt(
  input: StudioAiContextPromptInput,
): string {
  const base = input.basePrompt.trim().slice(0, STUDIO_AI_CONTEXT_PROMPT_MAX);
  const extras: string[] = [];
  if (input.note) {
    const context = contextNoteToPromptContext(input.note)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    extras.push(...context);
  }
  for (const fragment of input.hintFragments ?? []) {
    const trimmed = fragment.trim();
    if (trimmed) extras.push(trimmed);
  }
  if (input.palettePhrase?.trim()) extras.push(input.palettePhrase.trim());
  const kept: string[] = [];
  for (const extra of extras) {
    if (base.includes(extra) || kept.some((item) => item.includes(extra))) {
      continue;
    }
    const candidate = [base, ...kept, extra].filter(Boolean).join(", ");
    if (candidate.length > STUDIO_AI_CONTEXT_PROMPT_MAX) break;
    kept.push(extra);
  }
  return [base, ...kept].filter(Boolean).join(", ");
}
