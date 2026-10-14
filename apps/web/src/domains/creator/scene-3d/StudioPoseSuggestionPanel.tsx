import { useMemo, useState } from "react";

import {
  POSE_SUGGESTION_REASON_LABELS,
  suggestStudioPoses,
  type PoseCatalogEntry,
  type PoseSuggestionEmotion,
} from "./studio-pose-suggestion";

/**
 * 컷 맥락 포즈 추천 패널 (투닝 플러스 3D Studio "포즈 추천" 흡수).
 *
 * 장면 설명·대사를 넣으면 기존 포즈 카탈로그에서 맞는 포즈를 근거와 함께 제안한다.
 * 적용은 콜백 한 번으로 끝나고(원클릭), 추천이 없으면 없는 대로 안내한다.
 * 실제 포즈 데이터/적용은 호스트 카탈로그와 콜백이 주입한다.
 * 콘티·컷 편집 표면에서는 initial* props 로 컷 맥락을 미리 채워 연다
 * (StudioCutPoseRecommendationPanel 이 그 진입 래퍼다).
 */
export interface StudioPoseSuggestionPanelProps {
  readonly catalog: readonly PoseCatalogEntry[];
  /** 감정 매처가 이미 판정한 감정이 있으면 주입 (없으면 대사에서 약식 판정). */
  readonly emotion?: PoseSuggestionEmotion;
  readonly figures?: 1 | 2;
  readonly gender?: "male" | "female";
  readonly onApplyPose: (presetId: string) => void;
  /** 이중언어 표시가 필요한 표면용. 기본 한국어. */
  readonly locale?: "ko" | "en";
  /** 컷 표면에서 열 때 컷 맥락(메모·대사)으로 입력을 미리 채운다. 마운트 시 1회만 반영. */
  readonly initialSceneDescription?: string;
  readonly initialDialogue?: string;
}

const COPY = Object.freeze({
  ko: Object.freeze({
    title: "이 장면에 맞는 포즈",
    sceneLabel: "장면 설명",
    scenePlaceholder: "예: 카페에서 고백을 듣고 놀라는 장면",
    dialogueLabel: "대사 (선택)",
    dialoguePlaceholder: "예: 뭐…? 말도 안 돼!",
    empty: "아직 추천할 근거가 부족해요. 장면 설명이나 대사를 넣어 보세요.",
    noMatch: "조건에 맞는 포즈가 없어요. 인원 조건을 풀거나 설명을 바꿔 보세요.",
    apply: "이 포즈 적용",
  }),
  en: Object.freeze({
    title: "Poses for this scene",
    sceneLabel: "Scene description",
    scenePlaceholder: "e.g. Shocked by a confession at a cafe",
    dialogueLabel: "Dialogue (optional)",
    dialoguePlaceholder: "e.g. What…? No way!",
    empty: "Not enough context yet. Add a scene description or a line of dialogue.",
    noMatch: "No pose matches. Try loosening the figure count or rewording the scene.",
    apply: "Apply this pose",
  }),
});

export function StudioPoseSuggestionPanel(
  props: StudioPoseSuggestionPanelProps,
) {
  const copy = COPY[props.locale ?? "ko"];
  const [sceneDescription, setSceneDescription] = useState(props.initialSceneDescription ?? "");
  const [dialogue, setDialogue] = useState(props.initialDialogue ?? "");
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const hasContext = sceneDescription.trim() !== "" || dialogue.trim() !== "";
  const result = useMemo(
    () =>
      hasContext
        ? suggestStudioPoses(props.catalog, {
            sceneDescription,
            dialogue,
            emotion: props.emotion,
            figures: props.figures,
            gender: props.gender,
            limit: 3,
          })
        : null,
    [hasContext, props.catalog, props.emotion, props.figures, props.gender, sceneDescription, dialogue],
  );

  return (
    <section aria-label={copy.title} data-testid="pose-suggestion-panel">
      <h3>{copy.title}</h3>
      <label>
        <span>{copy.sceneLabel}</span>
        <input
          type="text"
          value={sceneDescription}
          onChange={(event) => setSceneDescription(event.target.value)}
          placeholder={copy.scenePlaceholder}
          data-testid="pose-suggestion-scene-input"
        />
      </label>
      <label>
        <span>{copy.dialogueLabel}</span>
        <input
          type="text"
          value={dialogue}
          onChange={(event) => setDialogue(event.target.value)}
          placeholder={copy.dialoguePlaceholder}
          data-testid="pose-suggestion-dialogue-input"
        />
      </label>

      {!hasContext || result === null ? (
        <p data-testid="pose-suggestion-empty">{copy.empty}</p>
      ) : result.suggestions.length === 0 ? (
        <p data-testid="pose-suggestion-no-match">{copy.noMatch}</p>
      ) : (
        <ul>
          {result.suggestions.map((suggestion) => (
            <li key={suggestion.presetId} data-testid={`pose-suggestion-${suggestion.presetId}`}>
              <span>{suggestion.name}</span>
              <span>
                {suggestion.reasons.map((reason) => (
                  <small key={reason}>
                    {POSE_SUGGESTION_REASON_LABELS[reason][props.locale ?? "ko"]}
                  </small>
                ))}
              </span>
              <button
                type="button"
                onClick={() => {
                  props.onApplyPose(suggestion.presetId);
                  setAppliedId(suggestion.presetId);
                }}
                aria-pressed={appliedId === suggestion.presetId}
              >
                {copy.apply}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
