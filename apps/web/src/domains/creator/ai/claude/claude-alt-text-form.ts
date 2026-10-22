import { ALT_TEXT_LANGUAGES, type AltTextLanguageId, type AltTextScope } from "./claude-alt-text";

import type { ClaudeEffortDepth, ClaudePresetId } from "@/shared/ai/claude/claude-effort-presets";

export interface AltTextForm {
  readonly presetId: ClaudePresetId;
  /** "직접 고르기"의 모델. 빈 문자열이면 연결 기본 모델. */
  readonly customModel: string;
  readonly customDepth: ClaudeEffortDepth;
  readonly language: AltTextLanguageId;
  readonly scope: AltTextScope;
  readonly genre: string;
  readonly notes: string;
}

/** 설명 언어의 기본값: 화면 언어가 지원 목록에 있으면 그것, 아니면 한국어. */
export function initialAltTextForm(uiLanguage: string): AltTextForm {
  const language = ALT_TEXT_LANGUAGES.find((item) => item.id === uiLanguage)?.id ?? "ko";
  return { presetId: "default", customModel: "", customDepth: "medium", language, scope: "standard", genre: "", notes: "" };
}
