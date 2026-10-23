import type { ArtDirectorMedium } from "./claude-art-director";
import type { ClaudePresetCaps } from "@/shared/ai/claude/ClaudePresetPicker";
import type { ClaudeEffortDepth, ClaudePresetId } from "@/shared/ai/claude/claude-effort-presets";

export interface ArtDirectorForm {
  readonly presetId: ClaudePresetId;
  /** "직접 고르기"의 모델. 빈 문자열이면 연결 기본 모델. */
  readonly customModel: string;
  readonly customDepth: ClaudeEffortDepth;
  readonly medium: ArtDirectorMedium;
  readonly genre: string;
  readonly mood: string;
  readonly notes: string;
}

export const DEFAULT_ART_DIRECTOR_FORM: ArtDirectorForm = Object.freeze({
  presetId: "default",
  customModel: "",
  customDepth: "medium",
  medium: "vertical-scroll",
  genre: "",
  mood: "",
  notes: "",
});

export type ArtDirectorPresetCaps = ClaudePresetCaps;
