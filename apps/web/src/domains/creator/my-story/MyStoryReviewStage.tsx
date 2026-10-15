import { ArrowLeft, Clapperboard, Info, PenLine, RotateCcw, TriangleAlert } from "lucide-react";
import { useId, useState, type Ref } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { MyStoryAiPanel } from "./MyStoryAiPanel";
import type { MyStoryTextCompleter } from "./my-story-ai";
import type { MyStoryDraft, MyStoryDraftCut } from "./my-story-draft";
import type { MyStorySession } from "./my-story-interview";
import { myStoryWarningMessage } from "./my-story-labels";
import {
  MY_STORY_TITLE_MAX_LENGTH,
  MY_STORY_TONES,
  type MyStoryCutCount,
  type MyStoryLocale,
  type MyStorySlotId,
  type MyStoryTemplate,
  type MyStoryToneId,
} from "./my-story-model";
import type { MyStorySaveState } from "./MyStoryAskStage";

export interface MyStoryReviewStageProps {
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly session: MyStorySession;
  readonly template: MyStoryTemplate;
  readonly draft: MyStoryDraft;
  readonly locale: MyStoryLocale;
  readonly complete: MyStoryTextCompleter;
  readonly opening: boolean;
  readonly openError: string | null;
  readonly saveState: MyStorySaveState;
  readonly onTitle: (title: string) => void;
  readonly onCutCount: (cutCount: MyStoryCutCount) => void;
  readonly onTone: (toneId: MyStoryToneId) => void;
  readonly onEditQuestion: (step: number) => void;
  readonly onAdopt: (slot: MyStorySlotId, text: string) => void;
  readonly onClearNarration: (slot: MyStorySlotId) => void;
  readonly onOpen: () => void;
  readonly onBack: () => void;
  readonly onRestart: () => void;
}

const BLANK_KO = "(빈칸)";
const BLANK_EN = "(blank)";

function CutRow({
  cut,
  template,
  onEditQuestion,
}: {
  readonly cut: MyStoryDraftCut;
  readonly template: MyStoryTemplate;
  readonly onEditQuestion: (step: number) => void;
}) {
  const bt = useBilingual("MyStoryReviewStage");
  const focusSlot = cut.parts[0]?.slot ?? cut.missing[0]?.slot;
  const focusStep = focusSlot ? template.questions.findIndex((question) => question.slot === focusSlot) : -1;
  // 문장 안에 끼우는 조각은 bt 결과가 아니라 ko/en 원문 한 쌍으로 따로 만든다(my-story-labels 머리말 참고).
  const missingKo = cut.missing.map((entry) => entry.labelKo).join(", ");
  const missingEn = cut.missing.map((entry) => entry.labelEn).join(", ");
  const positionKo = template.narration.position === "top" ? "위쪽" : "아래쪽";
  const positionEn = template.narration.position === "top" ? "top" : "bottom";
  const balloonKindKo = cut.balloon?.kind === "thought" ? "생각" : "대사";
  const balloonKindEn = cut.balloon?.kind === "thought" ? "thought" : "speech";

  return (
    <li className={cn("rounded-xl border bg-panel/40 p-4", cut.blank ? "border-dashed border-line-strong" : "border-line")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-fg">
          {bt(`컷 ${cut.index} · ${cut.labelKo}`, `Panel ${cut.index} · ${cut.labelEn}`)}
          {cut.blank ? (
            <span className="ml-2 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.7rem] font-semibold text-fg">
              {bt("빈칸", "Blank")}
            </span>
          ) : null}
        </h3>
        {focusStep >= 0 ? (
          <button
            type="button"
            onClick={() => onEditQuestion(focusStep)}
            className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 gap-1.5" })}
          >
            <PenLine size={13} aria-hidden />
            {cut.blank
              ? bt(`컷 ${cut.index} 빈칸 채우러 가기`, `Fill in panel ${cut.index}`)
              : bt(`컷 ${cut.index} 답변 고치기`, `Edit the answers for panel ${cut.index}`)}
          </button>
        ) : null}
      </div>

      <dl className="mt-2 space-y-2 text-sm leading-6">
        <div>
          <dt className="text-xs font-semibold text-fg-3">{bt("장면", "Scene")}</dt>
          <dd className={cn(cut.blank ? "text-fg-3" : "text-fg")}>
            {cut.blank
              ? bt(
                `${BLANK_KO} ${missingKo} 칸을 채우면 여기에 들어가요.`,
                `${BLANK_EN} It fills in once you answer: ${missingEn}.`,
              )
              : cut.summary}
          </dd>
          {!cut.blank && cut.missing.length > 0 ? (
            <dd className="text-xs text-fg-3">{bt(`빈 칸: ${missingKo}`, `Empty: ${missingEn}`)}</dd>
          ) : null}
        </div>
        {cut.narration ? (
          <div>
            <dt className="text-xs font-semibold text-fg-3">
              {bt(
                `나레이션 후보 (${positionKo} · 최대 ${cut.narration.maxChars}자)`,
                `Narration candidate (${positionEn} · up to ${cut.narration.maxChars} characters)`,
              )}
              {cut.narration.source === "ai" ? (
                <span className="ml-2 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.7rem] text-fg">
                  {bt("AI 문장", "AI sentence")}
                </span>
              ) : null}
            </dt>
            <dd className={cn(cut.narration.text ? "text-fg" : "text-fg-3")}>{cut.narration.text || bt(BLANK_KO, BLANK_EN)}</dd>
            {cut.narration.more.map((more) => (
              <dd key={more} className="text-fg-2">
                <span className="text-xs text-fg-3">{bt("이어서", "Next box")}: </span>
                {more}
              </dd>
            ))}
          </div>
        ) : null}
        {cut.balloon ? (
          <div>
            <dt className="text-xs font-semibold text-fg-3">
              {bt(
                `말풍선 후보 (${balloonKindKo} · 최대 ${cut.balloon.maxChars}자)`,
                `Balloon candidate (${balloonKindEn} · up to ${cut.balloon.maxChars} characters)`,
              )}
            </dt>
            <dd className={cn(cut.balloon.text ? "text-fg" : "text-fg-3")}>
              {cut.balloon.text
                ? `“${cut.balloon.text}”`
                : bt(
                  `${BLANK_KO} 답변에 “따옴표”로 묶은 말이 있으면 여기에 들어가요.`,
                  `${BLANK_EN} A line you put in “quotes” in your answer appears here.`,
                )}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{bt("연출 힌트", "Staging hint")}</dt>
          <dd className="text-xs leading-5 text-fg-3">{bt(cut.shotKo, cut.shotEn)}</dd>
        </div>
      </dl>
    </li>
  );
}

/** 3단계 — 규칙 기반 초안을 컷마다 보여 주고, 다듬은 뒤 스튜디오의 대본·콘티 경로로 연다. */
export function MyStoryReviewStage({
  headingRef,
  session,
  template,
  draft,
  locale,
  complete,
  opening,
  openError,
  saveState,
  onTitle,
  onCutCount,
  onTone,
  onEditQuestion,
  onAdopt,
  onClearNarration,
  onOpen,
  onBack,
  onRestart,
}: MyStoryReviewStageProps) {
  const bt = useBilingual("MyStoryReviewStage");
  const baseId = useId();
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const titleId = `${baseId}-title`;
  const tone = MY_STORY_TONES[draft.toneId];

  return (
    <section aria-labelledby={`${baseId}-heading`} className="space-y-6">
      <div className="space-y-2">
        <h2
          id={`${baseId}-heading`}
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-bold text-fg outline-none sm:text-2xl"
        >
          {bt("초안 미리보기", "Draft preview")}
        </h2>
        <p className="text-sm leading-6 text-fg-2">
          {bt(
            `컷 ${draft.cuts.length}장 중 ${draft.filledCuts}장이 채워졌고, 빈칸은 ${draft.blankCuts}장이에요. 초안은 답변을 컷에 배치한 것이고, 없는 내용을 만들어 넣지 않았어요.`,
            `${draft.filledCuts} of ${draft.cuts.length} panels are filled and ${draft.blankCuts} are blank. The draft only places your answers into panels; nothing was invented.`,
          )}
        </p>
        {saveState === "failed" ? (
          <p role="status" className="text-xs text-warn">
            {bt(
              "임시 저장에 실패했어요. 브라우저 저장 공간을 확인해 주세요. 이 화면의 내용은 그대로 유지돼요.",
              "Saving the draft failed. Check the browser storage. What is on this screen is kept.",
            )}
          </p>
        ) : null}
      </div>

      {template.cautionKo && template.cautionEn ? (
        <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm leading-6 text-fg">
          <Info size={16} aria-hidden className="mt-1 shrink-0 text-warn" />
          <span>{bt(template.cautionKo, template.cautionEn)}</span>
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-3">
          <label htmlFor={titleId} className="text-xs font-bold text-fg-2">
            {bt("작품 제목", "Work title")}
          </label>
          <input
            id={titleId}
            type="text"
            value={session.title}
            maxLength={MY_STORY_TITLE_MAX_LENGTH}
            placeholder={bt(template.defaultTitleKo, template.defaultTitleEn)}
            onChange={(event) => onTitle(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {template.cutCounts.length > 1 ? (
          <fieldset className="min-w-0">
            <legend className="text-xs font-bold text-fg-2">{bt("컷 수", "Panel count")}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {template.cutCounts.map((count) => (
                <label
                  key={count}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel/40 px-3 text-sm font-semibold text-fg has-[input:checked]:border-accent has-[input:checked]:bg-accent-soft has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name={`${baseId}-cut-count`}
                    checked={draft.cutCount === count}
                    onChange={() => onCutCount(count)}
                    className="sr-only"
                  />
                  {bt(`${count}컷`, `${count} panels`)}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {template.toneIds.length > 1 ? (
          <div className="md:col-span-2">
            <label htmlFor={`${baseId}-tone`} className="text-xs font-bold text-fg-2">
              {bt("분위기(톤)", "Tone")}
            </label>
            <select
              id={`${baseId}-tone`}
              value={draft.toneId}
              onChange={(event) => {
                const next = template.toneIds.find((toneId) => toneId === event.target.value);
                if (next) onTone(next);
              }}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            >
              {template.toneIds.map((toneId) => (
                <option key={toneId} value={toneId}>
                  {bt(MY_STORY_TONES[toneId].labelKo, MY_STORY_TONES[toneId].labelEn)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs leading-5 text-fg-3">{bt(tone.descriptionKo, tone.descriptionEn)}</p>
          </div>
        ) : (
          <p className="text-xs leading-5 text-fg-3 md:col-span-2">
            {bt(`분위기: ${tone.labelKo} — ${tone.descriptionKo}`, `Tone: ${tone.labelEn} — ${tone.descriptionEn}`)}
          </p>
        )}
      </div>

      {draft.warnings.length > 0 ? (
        <ul aria-label={bt("초안 확인 사항", "Things to check in the draft")} className="space-y-2">
          {draft.warnings.map((warning) => (
            <li
              key={warning.code}
              className="flex items-start gap-2 rounded-xl border border-line bg-panel/40 p-3 text-sm leading-6 text-fg-2"
            >
              <TriangleAlert size={15} aria-hidden className="mt-1 shrink-0 text-warn" />
              <span>{myStoryWarningMessage(bt, warning)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <ol aria-label={bt("컷 초안", "Panel draft")} className="space-y-3">
        {draft.cuts.map((cut) => (
          <CutRow key={cut.id} cut={cut} template={template} onEditQuestion={onEditQuestion} />
        ))}
      </ol>

      <MyStoryAiPanel
        draft={draft}
        locale={locale}
        complete={complete}
        onAdopt={onAdopt}
        onClear={onClearNarration}
      />

      <div className="rounded-2xl border border-accent/40 bg-accent-soft p-4 sm:p-5">
        <h3 className="text-base font-bold text-fg">{bt("스튜디오에서 이어 만들기", "Continue in the studio")}</h3>
        <p className="mt-1.5 text-sm leading-6 text-fg-2">
          {bt(
            `열면 컷툰 작품(${draft.cutCount}컷)이 새로 만들어져요. 초안은 대본과 컷 계획으로 들어가고, 대본 화면으로 이동해요. 대본 화면의 ‘컷 계획으로 적용’은 원고를 문장 단위로 다시 나누므로, 컷 구성을 그대로 두려면 누르지 않아도 돼요.`,
            `Opening creates a new card-comic work (${draft.cutCount} panels). The draft goes into the script and panel plan, and you land on the script view. “Apply as panel plan” there re-splits the text sentence by sentence, so you do not need it to keep this panel layout.`,
          )}
        </p>
        <p className="mt-1.5 text-sm text-fg-2">
          {bt("작품 제목", "Work title")}: <strong className="text-fg">{draft.title}</strong>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            disabled={opening}
            aria-busy={opening}
            className={buttonClass({ variant: "solid", size: "lg", className: "min-h-11 gap-2" })}
          >
            <Clapperboard size={16} aria-hidden />
            {opening ? bt("여는 중…", "Opening…") : openError ? bt("다시 시도", "Try again") : bt("스튜디오에서 열기", "Open in the studio")}
          </button>
        </div>
        {openError ? (
          <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm leading-6 text-fg">
            {openError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={onBack}
          className={buttonClass({ variant: "outline", size: "md", className: "min-h-11 gap-1.5" })}
        >
          <ArrowLeft size={15} aria-hidden />
          {bt("질문으로 돌아가기", "Back to the questions")}
        </button>
        {confirmingRestart ? (
          <span role="group" aria-label={bt("처음부터 다시 시작 확인", "Confirm starting over")} className="inline-flex flex-wrap items-center gap-2">
            <span className="text-sm text-fg-2">{bt("쓴 답변이 모두 지워져요.", "All your answers will be erased.")}</span>
            <button
              type="button"
              onClick={onRestart}
              className={buttonClass({ variant: "solid", size: "md", className: "min-h-11" })}
            >
              {bt("지우고 처음부터", "Erase and start over")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRestart(false)}
              className={buttonClass({ variant: "quiet", size: "md", className: "min-h-11" })}
            >
              {bt("취소", "Cancel")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRestart(true)}
            className={buttonClass({ variant: "quiet", size: "md", className: "min-h-11 gap-1.5" })}
          >
            <RotateCcw size={15} aria-hidden />
            {bt("처음부터 다시 시작", "Start over")}
          </button>
        )}
      </div>
    </section>
  );
}
