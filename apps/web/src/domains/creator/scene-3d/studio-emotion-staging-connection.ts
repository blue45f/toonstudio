/**
 * Emotion → expression/pose staging connection (TTT 연출 완성).
 *
 * 지금까지 감정 판정은 두 갈래로 끊겨 있었다.
 * - 식자 쪽: 대사 → 세분 감정 → 표정·포즈 프리셋 표 (studio-ai-emotion-staging-matcher)
 * - 포저 쪽: 장면 맥락 → 포즈 카탈로그 채점 추천 (studio-pose-suggestion) —
 *   감정을 주입받을 수 있는데도 아무도 감정 판정 결과를 넣어주지 않았다.
 *
 * 이 모듈이 그 연결점이다. 하나의 감정 판정(DialogueEmotionDetail)이
 * 1) 표정 프리셋 추천(감정×강도 표, 근거 코드 포함)과
 * 2) 포즈 추천(판정을 말풍선 감정 종류로 브리지해 포즈 엔진에 주입)
 * 을 동시에 몰아서, 한 패널이 표정과 포즈를 함께 제안할 수 있게 한다.
 * 전부 순수·결정적이며, 추천에는 항상 근거가 붙는다.
 */

import {
  analyzeDialogueEmotionDetail,
  dialogueEmotionLabel,
  recommendStagingForEmotion,
  speechEmotionKindFor,
  type DialogueEmotionDetail,
} from "../ai/studio-ai-emotion-staging-matcher";
import {
  suggestStudioPoses,
  type PoseCatalogEntry,
  type PoseSuggestion,
  type PoseSuggestionEmotion,
} from "./studio-pose-suggestion";

export const STUDIO_EMOTION_STAGING_CONNECTION_VERSION = 1 as const;

/** 표정 추천 한 건의 근거. */
export type ExpressionSuggestionReasonCode =
  /** 읽힌 감정의 대표 표정 (1순위). */
  | "emotion-primary"
  /** 감정 강도가 높아(≥0.8) 더 강한 변형이 1순위로 올라왔다. */
  | "intensity-boosted"
  /** 같은 감정의 대안 표정. */
  | "emotion-alternative";

export interface ExpressionSuggestion {
  /** EXPRESSION_PRESETS 실재 id. */
  readonly presetId: string;
  /** 1부터 시작하는 추천 순위. */
  readonly rank: number;
  readonly reason: ExpressionSuggestionReasonCode;
}

export interface EmotionStagingConnectionInput {
  /** 이미 판정된 감정. 없으면 text에서 판정한다. */
  readonly detail?: DialogueEmotionDetail;
  /** 컷의 대사 — 감정 판정과 포즈 키워드 근거에 함께 쓰인다. */
  readonly text?: string;
  /** 호스트가 주입하는 포즈 카탈로그 (PoseCatalogEntry 구조 호환). */
  readonly catalog: readonly PoseCatalogEntry[];
  /** 장면 설명 자유 텍스트 (콘티 메모 등) — 포즈 키워드 근거. */
  readonly sceneDescription?: string;
  readonly figures?: 1 | 2;
  readonly gender?: "male" | "female";
  /** 포즈 추천 개수 상한 (기본 3). */
  readonly poseLimit?: number;
}

export interface EmotionStagingConnection {
  readonly version: typeof STUDIO_EMOTION_STAGING_CONNECTION_VERSION;
  /** 두 추천을 함께 몬 감정 판정 (근거 어휘·강도·신뢰도 포함). */
  readonly detail: DialogueEmotionDetail;
  readonly emotionLabel: string;
  /** 포즈 엔진에 주입된 감정 종류 — 같은 판정이 포즈를 몰았다는 연결 증거. */
  readonly speechEmotion: PoseSuggestionEmotion;
  readonly expressions: readonly ExpressionSuggestion[];
  readonly poses: readonly PoseSuggestion[];
  /** 왜 이 연출인지 한 줄 이유 (연출표의 근거 문장). */
  readonly rationale: string;
  /** 감정 근거 어휘가 없어 판정이 약하다 — 담담한 연출로 정직하게 제안할 때 true. */
  readonly evidenceWeak: boolean;
}

/**
 * 감정 판정 하나를 표정 추천과 포즈 추천으로 동시에 연결한다.
 * 포즈가 카탈로그 조건(인원·성별)에 안 맞으면 poses만 비고 표정은 그대로 남는다.
 */
export function connectEmotionToStaging(
  input: EmotionStagingConnectionInput,
): EmotionStagingConnection {
  const detail =
    input.detail ?? analyzeDialogueEmotionDetail(input.text ?? "");
  const staged = recommendStagingForEmotion(detail.kind, detail.intensity);
  const baseFirstId = recommendStagingForEmotion(detail.kind, 0).expressionIds[0];
  const boostedId =
    staged.expressionIds[0] !== baseFirstId ? staged.expressionIds[0] : null;

  const expressions: readonly ExpressionSuggestion[] = Object.freeze(
    staged.expressionIds.map((presetId, index) =>
      Object.freeze({
        presetId,
        rank: index + 1,
        reason: (presetId === boostedId
          ? "intensity-boosted"
          : index === 0
            ? "emotion-primary"
            : "emotion-alternative") as ExpressionSuggestionReasonCode,
      }),
    ),
  );

  const speechEmotion: PoseSuggestionEmotion = speechEmotionKindFor(detail.kind);
  const poses = suggestStudioPoses(input.catalog, {
    dialogue: input.text,
    sceneDescription: input.sceneDescription,
    emotion: speechEmotion,
    figures: input.figures,
    gender: input.gender,
    limit: input.poseLimit ?? 3,
  }).suggestions;

  return Object.freeze({
    version: STUDIO_EMOTION_STAGING_CONNECTION_VERSION,
    detail,
    emotionLabel: dialogueEmotionLabel(detail.kind),
    speechEmotion,
    expressions,
    poses,
    rationale: staged.rationale,
    evidenceWeak: detail.matchedTerms.length === 0,
  });
}

/** 표정 추천 근거 코드의 이중언어 라벨 (패널 표시용). */
export const EXPRESSION_SUGGESTION_REASON_LABELS: Readonly<
  Record<
    ExpressionSuggestionReasonCode,
    { readonly ko: string; readonly en: string }
  >
> = Object.freeze({
  "emotion-primary": Object.freeze({
    ko: "읽힌 감정의 대표 표정이에요",
    en: "Signature expression for the detected emotion",
  }),
  "intensity-boosted": Object.freeze({
    ko: "감정이 강해서 더 센 표정을 올렸어요",
    en: "Boosted to a stronger variant for high intensity",
  }),
  "emotion-alternative": Object.freeze({
    ko: "같은 감정의 다른 표정이에요",
    en: "Alternative expression for the same emotion",
  }),
});
