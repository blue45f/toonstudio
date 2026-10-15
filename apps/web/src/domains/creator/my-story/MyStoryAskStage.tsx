import { ArrowLeft, ArrowRight, Check, FastForward, ListChecks, SkipForward } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  myStoryAnswerFor,
  myStoryAnsweredCount,
  myStoryProgress,
  type MyStorySession,
} from "./my-story-interview";
import { myStorySensitiveKindLabel } from "./my-story-labels";
import { MY_STORY_ANSWER_MAX_LENGTH, type MyStoryQuestion, type MyStoryTemplate } from "./my-story-model";
import { cleanMyStoryAnswer, detectMyStorySensitiveKinds } from "./my-story-text";

export type MyStorySaveState = "idle" | "saved" | "failed";

export interface MyStoryAskStageProps {
  readonly session: MyStorySession;
  readonly template: MyStoryTemplate;
  readonly question: MyStoryQuestion;
  /** 사용자가 단계를 오간 뒤에만 입력칸으로 초점을 옮긴다(페이지 첫 진입에서는 초점을 빼앗지 않는다). */
  readonly focusOnMount: boolean;
  readonly saveState: MyStorySaveState;
  readonly onAnswer: (text: string) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onGoto: (step: number) => void;
  readonly onReview: () => void;
  readonly onBackToPick: () => void;
}

/** 2단계 — 질문을 한 번에 하나씩. 이전/다음/건너뛰기와 Ctrl+Enter, 단계 목록으로 오간다. */
export function MyStoryAskStage({
  session,
  template,
  question,
  focusOnMount,
  saveState,
  onAnswer,
  onPrev,
  onNext,
  onGoto,
  onReview,
  onBackToPick,
}: MyStoryAskStageProps) {
  const bt = useBilingual("MyStoryAskStage");
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const exampleId = `${baseId}-example`;
  const countId = `${baseId}-count`;
  const hintId = `${baseId}-hint`;
  const sensitiveId = `${baseId}-sensitive`;
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
    // 질문이 바뀔 때(부모가 key로 다시 마운트)만 실행한다.
  }, [focusOnMount]);

  const progress = myStoryProgress(session);
  const answer = myStoryAnswerFor(session, question.slot);
  const blank = cleanMyStoryAnswer(answer) === "";
  const isLast = session.step >= template.questions.length - 1;
  const sensitiveKinds = detectMyStorySensitiveKinds(answer);
  const answeredAny = myStoryAnsweredCount(session) > 0;

  const forwardLabel = isLast
    ? (blank ? bt("건너뛰고 초안 보기", "Skip and see the draft") : bt("초안 보기", "See the draft"))
    : (blank ? bt("건너뛰기", "Skip") : bt("다음", "Next"));

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onNext();
  }

  return (
    <section aria-labelledby={titleId} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg-2">
          <span className="text-accent">
            {bt(`질문 ${progress.index} / ${progress.total}`, `Question ${progress.index} of ${progress.total}`)}
          </span>
          {" · "}
          {bt(`${progress.answered}개 답함`, `${progress.answered} answered`)}
        </p>
        <button
          type="button"
          onClick={onBackToPick}
          className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11" })}
        >
          <ArrowLeft size={14} aria-hidden />
          {bt("주제 다시 고르기", "Choose another topic")}
        </button>
      </div>

      <div
        role="progressbar"
        aria-label={bt("답한 질문", "Answered questions")}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.answered}
        aria-valuetext={bt(`${progress.total}개 중 ${progress.answered}개 답함`, `${progress.answered} of ${progress.total} answered`)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-raised"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <nav aria-label={bt("질문 목록", "Question list")}>
        <ol className="flex flex-wrap gap-1.5">
          {template.questions.map((item, index) => {
            const done = cleanMyStoryAnswer(myStoryAnswerFor(session, item.slot)) !== "";
            const current = index === session.step;
            return (
              <li key={item.slot}>
                <button
                  type="button"
                  onClick={() => onGoto(index)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                    current
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-panel/40 text-fg-2 hover:border-accent/50",
                  )}
                >
                  {done ? <Check size={12} aria-hidden className="text-accent" /> : <span aria-hidden>{index + 1}</span>}
                  {bt(item.labelKo, item.labelEn)}{" "}
                  <span className="sr-only">
                    {done ? bt("답함", "answered") : bt("아직 비어 있음", "empty")}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="space-y-2">
        <h2 id={titleId} className="text-xl font-bold leading-snug text-fg sm:text-2xl">
          {bt(question.promptKo, question.promptEn)}
        </h2>
        <p id={exampleId} className="text-sm leading-6 text-fg-2">
          {bt(`예시: ${question.exampleKo}`, `Example: ${question.exampleEn}`)}
        </p>
        <textarea
          ref={inputRef}
          value={answer}
          maxLength={MY_STORY_ANSWER_MAX_LENGTH}
          rows={4}
          onChange={(event) => onAnswer(event.target.value)}
          onKeyDown={onKeyDown}
          aria-labelledby={titleId}
          aria-describedby={[exampleId, countId, hintId, sensitiveKinds.length > 0 ? sensitiveId : null].filter(Boolean).join(" ")}
          className="min-h-32 w-full resize-y rounded-xl border border-line bg-panel px-3 py-2.5 text-base leading-7 text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-3">
          <p id={hintId}>
            {bt(
              "비워 두고 넘어가도 돼요. 빈 칸은 초안에도 빈칸으로 남아요. Ctrl+Enter로도 넘어갈 수 있어요.",
              "You can leave it empty; it stays blank in the draft. Ctrl+Enter also moves on.",
            )}
          </p>
          <p id={countId}>{Array.from(answer).length} / {MY_STORY_ANSWER_MAX_LENGTH}</p>
        </div>
        {sensitiveKinds.length > 0 ? (
          <p
            id={sensitiveId}
            role="status"
            className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs leading-5 text-fg"
          >
            {bt(
              `개인 정보처럼 보이는 내용이 있어요 (${sensitiveKinds.map((kind) => myStorySensitiveKindLabel(bt, kind)).join(", ")}). 꼭 필요한 게 아니라면 지우거나 호칭으로 바꿔 주세요.`,
              `This looks like personal information (${sensitiveKinds.map((kind) => myStorySensitiveKindLabel(bt, kind)).join(", ")}). Remove it or use a title instead unless you need it.`,
            )}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={session.step <= 0}
          className={buttonClass({ variant: "outline", size: "md", className: "min-h-11 gap-1.5" })}
        >
          <ArrowLeft size={15} aria-hidden />
          {bt("이전", "Back")}
        </button>
        <button
          type="button"
          onClick={onNext}
          className={buttonClass({ variant: blank ? "outline" : "solid", size: "md", className: "min-h-11 gap-1.5" })}
        >
          {forwardLabel}
          {blank ? <SkipForward size={15} aria-hidden /> : <ArrowRight size={15} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onReview}
          disabled={!answeredAny}
          className={buttonClass({ variant: "quiet", size: "md", className: "min-h-11 gap-1.5" })}
        >
          <FastForward size={15} aria-hidden />
          {bt("여기까지로 초안 보기", "See the draft so far")}
        </button>
      </div>

      <p
        role={saveState === "failed" ? "status" : undefined}
        className={cn("flex items-center gap-1.5 text-xs", saveState === "failed" ? "text-warn" : "text-fg-3")}
      >
        <ListChecks size={13} aria-hidden />
        {saveState === "failed"
          ? bt(
            "임시 저장에 실패했어요. 브라우저 저장 공간을 확인해 주세요. 이 화면의 내용은 그대로 유지돼요.",
            "Saving the draft failed. Check the browser storage. What is on this screen is kept.",
          )
          : saveState === "saved"
            ? bt("이 기기에 임시 저장됨", "Saved on this device")
            : bt("쓰는 대로 이 기기에 임시 저장돼요", "Saved on this device as you type")}
      </p>
    </section>
  );
}
