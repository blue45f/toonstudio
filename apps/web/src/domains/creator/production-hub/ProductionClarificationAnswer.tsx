import { RefreshCw } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { ClarificationThread } from "@toonstudio/core/production";

import type { ProductionClientCommand } from "./production-api";
import { normalizeReviewCommentText } from "./production-comment-retry-guard";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 샘플 체험에서만 미리 채우는 예시 답변. 실제 프로젝트에는 사용자가 입력한 답만 기록한다. */
export const SAMPLE_CLARIFICATION_ANSWER = "문양은 보여도 되지만 발신인을 특정할 수 있는 글자와 도상은 마지막 컷 전까지 가립니다.";

const MAX_ANSWER_LENGTH = 2_000;

/**
 * 막힌 질문에 답하고 결정을 기록하는 작은 입력 영역.
 * 답변 담당자만 기록할 수 있고, 빈 답은 기록하지 않는다.
 */
export function ProductionClarificationAnswer({
  thread,
  canAnswer,
  lockedHint,
  isDemo,
  execute,
}: {
  readonly thread: ClarificationThread;
  readonly canAnswer: boolean;
  /** 기록할 수 없을 때 이유와 방법을 알려 주는 문구. */
  readonly lockedHint: string;
  readonly isDemo: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
}) {
  const bt = useBilingual("ProductionClarificationAnswer");
  const inputId = useId();
  const hintId = useId();
  const [answer, setAnswer] = useState(isDemo ? SAMPLE_CLARIFICATION_ANSWER : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const attemptRef = useRef<{ readonly fingerprint: string; readonly updatedAt: string } | null>(null);
  const trimmed = answer.trim();

  const submit = async () => {
    if (!canAnswer || !trimmed || saving || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const fingerprint = `${thread.id}:${normalizeReviewCommentText(trimmed)}`;
    if (attemptRef.current?.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, updatedAt: new Date().toISOString() };
    }
    const updatedAt = attemptRef.current.updatedAt;
    try {
      await execute({
        type: "upsert-clarification",
        clarification: {
          ...thread,
          status: "decision-recorded",
          answer: trimmed,
          decisionRecordId: `decision-${thread.id}`,
          updatedAt,
        },
      }, bt("질문 답변과 결정을 기록했습니다.", "Recorded the answer and decision."));
      attemptRef.current = null;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : bt("답변을 저장하지 못했습니다. 작성한 내용은 그대로 유지되었습니다.", "Could not save answer. Your input was preserved."),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={inputId} className="block text-[0.6875rem] font-bold text-fg-2">
        {isDemo ? bt("결정 내용 (샘플 예시 답변)", "Decision (sample answer)") : bt("결정 내용", "Decision")}
      </label>
      <textarea
        id={inputId}
        value={answer}
        maxLength={MAX_ANSWER_LENGTH}
        rows={3}
        disabled={!canAnswer || saving}
        aria-describedby={hintId}
        onChange={(event) => setAnswer(event.target.value)}
        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs leading-5 text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
      />
      <button
        type="submit"
        className={buttonClass({ size: "sm", className: "min-h-11 w-full" })}
        disabled={!canAnswer || !trimmed || saving}
      >
        {saving ? bt("기록 중…", "Recording…") : bt("결정 기록", "Record decision")}
      </button>
      {error ? (
        <div role="alert" className="rounded-xl border border-bad/35 bg-bad/10 p-2.5 text-xs text-fg">
          <p>{error}</p>
          <button
            type="button"
            data-testid="clarification-answer-retry-btn"
            disabled={!canAnswer || !trimmed || saving}
            onClick={() => void submit()}
            className={buttonClass({ variant: "outline", size: "sm", className: "mt-2 min-h-8 w-full gap-1 text-xs" })}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            {bt("같은 답변 다시 기록", "Retry recording same answer")}
          </button>
        </div>
      ) : null}
      <p id={hintId} className="text-[0.6875rem] leading-4 text-fg-3">
        {canAnswer
          ? bt("기록한 결정은 인계와 검수의 근거로 남습니다.", "The decision is kept as evidence for handoff and review.")
          : lockedHint}
      </p>
    </form>
  );
}
