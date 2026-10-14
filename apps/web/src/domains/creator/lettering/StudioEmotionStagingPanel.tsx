/**
 * 감정 연출 제안 패널 — 대사 한 줄을 넣으면 표정·포즈 연출을 제안한다.
 *
 * 투닝 TTT의 "글이 감정을 읽어 표정과 동작을 연출"을 흡수한 표면.
 * 판정·추천은 순수 모듈(studio-ai-emotion-staging-matcher)이 하고,
 * 이 패널은 표시와 "적용" 콜백만 담당한다 — 실제 적용(프리셋 로드)은
 * 호스트가 기존 포즈·표정 적용 경로로 연결한다 (NOTES 명세 참조).
 *
 * 상태: 빈 입력이면 사용법을 안내하고, 감정 근거가 약하면 그 사실을
 * 밝히고 담담한 연출을 기본으로 제안한다 (지어내지 않는다). 말풍선
 * 형태는 기존 감정 말풍선 매처가 함께 제안한다는 연결을 명시한다.
 */

import { useMemo, useState } from "react";

import {
  dialogueEmotionLabel,
  recommendStagingForText,
} from "../ai/studio-ai-emotion-staging-matcher";

export interface StudioEmotionStagingPanelProps {
  /** 현재 말풍선의 대사 — 패널을 열 때 초기값. */
  readonly initialText?: string;
  /** 표정 프리셋 적용 (호스트의 기존 표정 적용 경로로 연결). */
  readonly onApplyExpression: (expressionId: string) => void;
  /** 포즈 프리셋 적용 (호스트의 기존 포즈 적용 경로로 연결). */
  readonly onApplyPose: (poseId: string) => void;
  /** 표정 프리셋 id → 표시 이름 해석 (호스트 카탈로그). 없으면 id를 그대로 보여준다. */
  readonly resolveExpressionLabel?: (expressionId: string) => string;
  readonly resolvePoseLabel?: (poseId: string) => string;
}

export function StudioEmotionStagingPanel(props: StudioEmotionStagingPanelProps) {
  const [text, setText] = useState(props.initialText ?? "");
  const trimmed = text.trim();
  const result = useMemo(
    () => (trimmed ? recommendStagingForText(trimmed) : null),
    [trimmed],
  );

  return (
    <section aria-label="감정 연출 제안" className="flex flex-col gap-3">
      <label htmlFor="emotion-staging-input" className="text-sm font-bold text-fg">
        대사를 넣으면 어울리는 표정·동작을 제안해요
      </label>
      <textarea
        id="emotion-staging-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        placeholder="예: 드디어 해냈어! 정말 기뻐!"
        className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
      />
      {!result ? (
        <p className="text-sm text-fg-3">
          대사 한 줄을 입력하면 감정을 읽어 표정과 포즈를 골라 드려요. 말풍선
          모양은 감정 말풍선 추천이 함께 제안합니다.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-2" aria-live="polite">
            읽힌 감정:{" "}
            <strong className="text-fg">
              {dialogueEmotionLabel(result.detail.kind)}
            </strong>{" "}
            (강도 {Math.round(result.detail.intensity * 100)}%)
            {result.detail.matchedTerms.length > 0 ? (
              <> — 근거: {result.detail.matchedTerms.join(", ")}</>
            ) : (
              <> — 뚜렷한 감정 단서가 없어 담담한 연출을 제안해요</>
            )}
          </p>
          <p className="text-sm text-fg-3">{result.staging.rationale}</p>
          <div>
            <p className="text-xs font-bold text-fg-3">표정 제안</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {result.staging.expressionIds.map((id, index) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => props.onApplyExpression(id)}
                  className={
                    index === 0
                      ? "min-h-10 rounded-full bg-accent px-4 text-sm font-bold text-white"
                      : "min-h-10 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-fg-2 hover:bg-panel-2"
                  }
                >
                  {props.resolveExpressionLabel?.(id) ?? id}
                  {index === 0 ? " · 추천" : ""}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-fg-3">포즈 제안</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {result.staging.poseIds.map((id, index) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => props.onApplyPose(id)}
                  className={
                    index === 0
                      ? "min-h-10 rounded-full bg-accent px-4 text-sm font-bold text-white"
                      : "min-h-10 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-fg-2 hover:bg-panel-2"
                  }
                >
                  {props.resolvePoseLabel?.(id) ?? id}
                  {index === 0 ? " · 추천" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
