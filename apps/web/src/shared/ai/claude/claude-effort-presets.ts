/**
 * Claude 보조의 "방식" 프리셋 — 모델과 생각 깊이(effort)를 따로 고르게 하던 두 선택을 "목적"으로 묶는다.
 *
 * 선택을 줄이되 숨기지는 않는다: 프리셋마다 쓸 모델과 깊이가 화면에 이름으로 드러나고, "직접 고르기"에서는
 * 두 값을 그대로 고른다. 사용자가 고르지 않은 모델로 몰래 바꾸는 일은 없다(기본·정밀은 연결에 정한 모델을 쓴다).
 * 이미지 분석·번역처럼 비용과 품질을 맞바꾸는 모든 기능이 같은 네 가지를 쓴다.
 */
import { CLAUDE_TIER_DEFAULT_MODEL } from "./claude-models";

export type ClaudeEffortDepth = "low" | "medium" | "high";
export type ClaudePresetId = "default" | "quick" | "precise" | "custom";

/** 화면에 보이는 순서: 빠른 것부터 직접 고르기까지. */
export const CLAUDE_PRESET_IDS: readonly ClaudePresetId[] = Object.freeze(["quick", "default", "precise", "custom"]);

export interface ClaudePresetChoice {
  /** "직접 고르기"에서 고른 모델. 빈 문자열이면 연결의 기본 모델. */
  readonly customModel: string;
  readonly customDepth: ClaudeEffortDepth;
}

export interface ResolvedClaudePreset {
  readonly model: string;
  readonly depth: ClaudeEffortDepth;
}

/** 프리셋을 실제 모델·깊이로 푼다. `connectionModel`은 사용자가 연결에 정한 기본 모델이다. */
export function resolveClaudePreset(
  id: ClaudePresetId,
  connectionModel: string,
  choice: ClaudePresetChoice,
): ResolvedClaudePreset {
  switch (id) {
    case "quick":
      return { model: CLAUDE_TIER_DEFAULT_MODEL.fast, depth: "low" };
    case "precise":
      return { model: connectionModel, depth: "high" };
    case "custom":
      return { model: choice.customModel || connectionModel, depth: choice.customDepth };
    case "default":
    default:
      return { model: connectionModel, depth: "medium" };
  }
}
