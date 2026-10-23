import { useMemo, useState } from "react";

import { useT } from "@/shared/lib/i18n";
import "../studio-scene3d-status-i18n";

import {
  POSE_SUGGESTION_REASON_LABELS,
  type PoseCatalogEntry,
} from "./studio-pose-suggestion";
import {
  EXPRESSION_SUGGESTION_REASON_LABELS,
  connectEmotionToStaging,
} from "./studio-emotion-staging-connection";

/**
 * 표정·포즈 동시 제안 패널 (TTT 연출 완성).
 *
 * 대사 한 줄의 감정 판정 하나가 표정 프리셋 추천과 포즈 카탈로그 추천을
 * 동시에 몬다 (studio-emotion-staging-connection). 작가는 근거(읽힌 감정·
 * 근거 어휘·추천별 이유)를 보고 표정만, 포즈만, 또는 둘 다 한 번에 적용한다.
 * 실제 적용은 호스트의 기존 표정·포즈 적용 경로 콜백으로 위임한다.
 *
 * 상태: 빈 입력이면 사용법을 안내하고, 감정 근거가 약하면 그 사실을 밝히고
 * 담담한 연출을 제안하며, 포즈만 조건에 안 맞으면 표정은 남기고 알린다.
 */
export interface StudioEmotionStagingSuggestionPanelProps {
  /** 호스트 포즈 카탈로그 (ADVANCED_WEBTOON_POSES 등 PoseCatalogEntry 호환). */
  readonly catalog: readonly PoseCatalogEntry[];
  /** 컷의 현재 대사 — 패널을 열 때 초기값. */
  readonly initialDialogue?: string;
  readonly figures?: 1 | 2;
  readonly gender?: "male" | "female";
  /** 표정 프리셋 적용 (호스트의 기존 표정 적용 경로로 연결). */
  readonly onApplyExpression: (expressionId: string) => void;
  /** 포즈 프리셋 적용 (호스트의 기존 포즈 적용 경로로 연결). */
  readonly onApplyPose: (poseId: string) => void;
  /** 표정 프리셋 id → 표시 이름 해석 (호스트 카탈로그). 없으면 id를 그대로 보여준다. */
  readonly resolveExpressionLabel?: (expressionId: string) => string;
}

export function StudioEmotionStagingSuggestionPanel(
  props: StudioEmotionStagingSuggestionPanelProps,
) {
  const t = useT();
  const [text, setText] = useState(props.initialDialogue ?? "");
  const [appliedExpressionId, setAppliedExpressionId] = useState<string | null>(
    null,
  );
  const [appliedPoseId, setAppliedPoseId] = useState<string | null>(null);
  const trimmed = text.trim();
  const result = useMemo(
    () =>
      trimmed
        ? connectEmotionToStaging({
            text: trimmed,
            catalog: props.catalog,
            figures: props.figures,
            gender: props.gender,
          })
        : null,
    [trimmed, props.catalog, props.figures, props.gender],
  );

  const topExpression = result?.expressions[0] ?? null;
  const topPose = result?.poses[0] ?? null;

  const applyExpression = (expressionId: string) => {
    props.onApplyExpression(expressionId);
    setAppliedExpressionId(expressionId);
  };
  const applyPose = (poseId: string) => {
    props.onApplyPose(poseId);
    setAppliedPoseId(poseId);
  };
  const applyBoth = () => {
    if (!topExpression || !topPose) return;
    applyExpression(topExpression.presetId);
    applyPose(topPose.presetId);
  };

  return (
    <section aria-label="표정·포즈 연출 제안" className="flex flex-col gap-3">
      <label
        htmlFor="emotion-staging-connection-input"
        className="text-sm font-bold text-fg"
      >
        대사를 넣으면 어울리는 표정과 포즈를 함께 제안해요
      </label>
      <textarea
        id="emotion-staging-connection-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        placeholder="예: 너 때문에 다 망쳤어. 화나 죽겠어!"
        className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
      />
      {!result ? (
        <p className="text-sm text-fg-3">
          대사 한 줄을 입력하면 감정을 읽어 표정 프리셋과 포즈를 한 번에 골라
          드려요. 추천마다 이유가 함께 표시됩니다.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-2" aria-live="polite">
            읽힌 감정:{" "}
            <strong className="text-fg">{result.emotionLabel}</strong> (강도{" "}
            {Math.round(result.detail.intensity * 100)}%)
            {result.evidenceWeak ? (
              <> — 뚜렷한 감정 단서가 없어 담담한 연출을 제안해요</>
            ) : (
              <> — 근거: {result.detail.matchedTerms.join(", ")}</>
            )}
          </p>
          <p className="text-sm text-fg-3">{result.rationale}</p>

          <div>
            <p className="text-xs font-bold text-fg-3">표정 제안</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {result.expressions.map((expression) => (
                <button
                  key={expression.presetId}
                  type="button"
                  onClick={() => applyExpression(expression.presetId)}
                  aria-pressed={appliedExpressionId === expression.presetId}
                  title={EXPRESSION_SUGGESTION_REASON_LABELS[expression.reason].ko}
                  className={
                    expression.rank === 1
                      ? "min-h-10 rounded-full bg-accent px-4 text-sm font-bold text-white"
                      : "min-h-10 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-fg-2 hover:bg-panel-2"
                  }
                >
                  {props.resolveExpressionLabel?.(expression.presetId) ??
                    expression.presetId}
                  {expression.rank === 1 ? " · 추천" : ""}
                  {expression.reason === "intensity-boosted" ? " · 강함" : ""}
                </button>
              ))}
            </div>
            {topExpression ? (
              <p className="mt-1 text-xs text-fg-3">
                {EXPRESSION_SUGGESTION_REASON_LABELS[topExpression.reason].ko}
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-bold text-fg-3">포즈 제안</p>
            {result.poses.length === 0 ? (
              <p className="mt-1 text-sm text-fg-3">
                {t("studio.scene3dStatus.emotionStaging.noPoseMatch", "조건(인원·성별)에 맞는 포즈가 없어요. 표정 제안은 그대로 쓸 수 있어요.")}
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-2">
                {result.poses.map((pose) => (
                  <li
                    key={pose.presetId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-fg">
                      {pose.name}
                      <span className="ml-2 text-xs text-fg-3">
                        {pose.reasons
                          .map(
                            (reason) => POSE_SUGGESTION_REASON_LABELS[reason].ko,
                          )
                          .join(" · ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => applyPose(pose.presetId)}
                      aria-pressed={appliedPoseId === pose.presetId}
                      className="min-h-10 shrink-0 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-fg-2 hover:bg-panel-2"
                    >
                      이 포즈 적용
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={applyBoth}
            disabled={!topExpression || !topPose}
            className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            추천 표정+포즈 함께 적용
          </button>
        </div>
      )}
    </section>
  );
}
