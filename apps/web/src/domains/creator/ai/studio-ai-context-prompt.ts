/**
 * studio-ai-context-prompt.ts — 맥락 노트·힌트·팔레트 프롬프트 합성 (순수 모듈, fetch 없음).
 *
 * 맥락 노트(studio-ai-context-note.ts)는 표시·프롬프트 컨텍스트 컴파일까지만
 * 있고 채색 프롬프트 합성은 호출부의 몫이었다. 이 모듈은 기본 프롬프트에
 * 맥락·힌트·팔레트 문장을 한 번에 합성한다. 우선순위는 기본 프롬프트 >
 * 맥락 > 힌트 > 팔레트이며, 이미 들어 있는 문장은 중복 추가하지 않고,
 * 채색 패널의 300자 상한 안에 들어가는 항목을 순서대로 담는다.
 */

import type { StudioAiContextNote } from "./studio-ai-context-note";
import { listContextNotePromptSections } from "./studio-ai-context-note";

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
  let prompt = input.basePrompt.trim().slice(0, STUDIO_AI_CONTEXT_PROMPT_MAX);

  function appendIfFits(fragment: string): boolean {
    const text = fragment.trim();
    if (!text || prompt.includes(text)) return true;
    const candidate = prompt ? `${prompt}, ${text}` : text;
    if (candidate.length > STUDIO_AI_CONTEXT_PROMPT_MAX) return false;
    prompt = candidate;
    return true;
  }

  if (input.note) {
    for (const { label, items, separator } of listContextNotePromptSections(input.note)) {
      if (appendIfFits(`${label}: ${items.join(separator)}`)) continue;
      // 긴 그룹은 개별 규칙으로 나눠, 들어가는 항목의 의미와 출처를 보존한다.
      for (const item of items) appendIfFits(`${label}: ${item}`);
    }
  }
  for (const fragment of input.hintFragments ?? []) appendIfFits(fragment);
  if (input.palettePhrase) appendIfFits(input.palettePhrase);
  return prompt;
}
