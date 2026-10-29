import type { ArtDirectorMedium } from "./assist-art-director";
import type { AssistPresetCaps } from "@/shared/ai/assist/AssistPresetPicker";
import type { AssistEffortDepth, AssistPresetId } from "@/shared/ai/assist/assist-effort-presets";

export interface ArtDirectorForm {
  readonly presetId: AssistPresetId;
  /** "직접 고르기"의 모델. 빈 문자열이면 연결 기본 모델. */
  readonly customModel: string;
  readonly customDepth: AssistEffortDepth;
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

export type ArtDirectorPresetCaps = AssistPresetCaps;
