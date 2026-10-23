import type { LocalizeBudget, LocalizeLanguageId, LocalizeTone } from "./claude-localize";
import type { ClaudeEffortDepth, ClaudePresetId } from "@/shared/ai/claude/claude-effort-presets";

export interface LocalizeForm {
  readonly sourceLang: LocalizeLanguageId | "auto";
  readonly targetLang: LocalizeLanguageId;
  readonly tone: LocalizeTone;
  readonly budget: LocalizeBudget;
  readonly glossaryText: string;
  readonly genre: string;
  readonly notes: string;
  readonly presetId: ClaudePresetId;
  readonly customModel: string;
  readonly customDepth: ClaudeEffortDepth;
}

export const DEFAULT_LOCALIZE_FORM: LocalizeForm = Object.freeze({
  sourceLang: "auto",
  targetLang: "en",
  tone: "keep",
  budget: "comfortable",
  glossaryText: "",
  genre: "",
  notes: "",
  presetId: "default",
  customModel: "",
  customDepth: "medium",
});

/** 화면 언어가 영어면 한국어로, 그 밖에는 영어로 번역하는 것이 가장 흔한 쓰임이라 그렇게 시작한다. */
export function initialLocalizeForm(uiLanguage: string): LocalizeForm {
  return { ...DEFAULT_LOCALIZE_FORM, targetLang: uiLanguage === "en" ? "ko" : "en" };
}
