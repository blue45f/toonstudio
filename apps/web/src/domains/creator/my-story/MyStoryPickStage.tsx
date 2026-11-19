import { ArrowRight, History, Info } from "lucide-react";
import { useId, useState, type Ref } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { MY_STORY_TONES, type MyStoryTemplateId } from "./my-story-model";
import { MY_STORY_TEMPLATES, myStoryTemplateById } from "./my-story-templates";
import { myStoryAnsweredCount, type MyStorySession } from "./my-story-interview";

export interface MyStoryPickStageProps {
  readonly headingRef: Ref<HTMLHeadingElement>;
  /** 처음 골라 둘 주제(주소의 ?topic=). */
  readonly initialTemplateId: MyStoryTemplateId | null;
  /** 이 기기에 남아 있는, 이어 쓸 수 있는 진행. 없으면 null. */
  readonly resumable: MyStorySession | null;
  readonly onStart: (templateId: MyStoryTemplateId) => void;
  readonly onResume: () => void;
  readonly onDiscardResumable: () => void;
}

/** 1단계 — 어떤 이야기를 남길지 주제를 고른다. 이어 쓸 진행이 있으면 먼저 알린다. */
export function MyStoryPickStage({
  headingRef,
  initialTemplateId,
  resumable,
  onStart,
  onResume,
  onDiscardResumable,
}: MyStoryPickStageProps) {
  const bt = useBilingual("MyStoryPickStage");
  const groupId = useId();
  const [selectedId, setSelectedId] = useState<MyStoryTemplateId>(initialTemplateId ?? "free-story");
  const selected = myStoryTemplateById(selectedId) ?? MY_STORY_TEMPLATES[0];
  const resumableTemplate = myStoryTemplateById(resumable?.templateId);
  const tone = selected ? MY_STORY_TONES[selected.toneIds[0] ?? "warm-memory"] : null;

  return (
    <section aria-labelledby={`${groupId}-title`} className="space-y-5 break-keep [overflow-wrap:break-word]">
      <h2
        id={`${groupId}-title`}
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold leading-[1.25] tracking-[-0.02em] text-fg outline-none sm:text-2xl"
      >
        {bt("어떤 이야기를 남기고 싶나요?", "What story do you want to keep?")}
      </h2>

      {resumable && resumableTemplate ? (
        <div
          role="group"
          aria-label={bt("이어 쓸 수 있는 이야기", "A story you can continue")}
          className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        >
          <p className="flex min-w-0 items-start gap-2 text-sm leading-[1.6] tracking-[-0.01em] text-fg">
            <History size={16} strokeWidth={1.5} aria-hidden className="mt-1 shrink-0 text-accent" />
            <span>
              {bt(
                `이 기기에 쓰던 ‘${resumableTemplate.titleKo}’ 이야기가 남아 있어요 (질문 ${myStoryAnsweredCount(resumable)}/${resumableTemplate.questions.length}개 답함).`,
                `A “${resumableTemplate.titleEn}” story is still saved on this device (${myStoryAnsweredCount(resumable)} of ${resumableTemplate.questions.length} questions answered).`,
              )}
              <span className="mt-0.5 block text-xs leading-[1.55] text-fg-2">
                {bt(
                  "다른 주제로 새로 적기 시작하면 이 기록은 새 이야기로 대체돼요.",
                  "If you start writing a different topic, this record is replaced by the new story.",
                )}
              </span>
            </span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={onResume}
              className={buttonClass({ variant: "solid", size: "md", className: "min-h-11 w-full justify-center sm:w-auto" })}
            >
              {bt("이어서 쓰기", "Continue writing")}
            </button>
            <button
              type="button"
              onClick={onDiscardResumable}
              className={buttonClass({ variant: "outline", size: "md", className: "min-h-11 w-full justify-center sm:w-auto" })}
            >
              {bt("지우고 새로 시작", "Erase and start over")}
            </button>
          </div>
        </div>
      ) : null}

      <fieldset className="min-w-0">
        <legend className="sr-only">{bt("이야기 주제", "Story topic")}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MY_STORY_TEMPLATES.map((template) => (
            <label
              key={template.id}
              className={cn(
                "flex min-h-11 cursor-pointer flex-col rounded-2xl border border-line bg-panel/40 p-4 transition-colors duration-150",
                "hover:border-accent/50 has-[input:checked]:border-accent has-[input:checked]:bg-accent-soft",
                "has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent",
              )}
            >
              <input
                type="radio"
                name={`${groupId}-topic`}
                value={template.id}
                checked={selectedId === template.id}
                onChange={() => setSelectedId(template.id)}
                className="sr-only"
              />
              <span className="text-base font-semibold leading-[1.35] tracking-[-0.015em] text-fg">
                {bt(template.titleKo, template.titleEn)}
              </span>
              <span className="mt-1 text-sm leading-[1.6] tracking-[-0.01em] text-fg-2">
                {bt(template.summaryKo, template.summaryEn)}
              </span>
              <span className="mt-2 text-xs font-medium tabular-nums text-fg-3">
                {bt(
                  `질문 ${template.questions.length}개 · ${template.cutCounts.map((count) => `${count}컷`).join("/")}`,
                  `${template.questions.length} questions · ${template.cutCounts.map((count) => `${count} panels`).join("/")}`,
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {selected ? (
        <div className="rounded-2xl border border-line bg-panel/40 p-4 sm:p-5">
          <h3 className="text-sm font-semibold tracking-[-0.015em] text-fg">
            {bt(`‘${selected.titleKo}’ 주제의 질문`, `Questions for “${selected.titleEn}”`)}
          </h3>
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {selected.questions.map((question) => (
              <li
                key={question.slot}
                className="rounded-md bg-raised/70 px-2.5 py-1 text-xs font-medium text-fg-2"
              >
                {bt(question.labelKo, question.labelEn)}
              </li>
            ))}
          </ol>
          {tone ? (
            <p className="mt-3 text-xs tabular-nums leading-[1.6] text-fg-3">
              {bt(
                `기본 분위기: ${tone.labelKo} · 초안은 ${selected.cutCounts.map((count) => `${count}컷`).join(" 또는 ")} 구성이에요.`,
                `Default tone: ${tone.labelEn} · the draft is ${selected.cutCounts.map((count) => `${count}`).join(" or ")} panels.`,
              )}
            </p>
          ) : null}
          {selected.cautionKo && selected.cautionEn ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn/10 p-3 text-xs leading-[1.6] text-fg">
              <Info size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-warn" />
              <span>{bt(selected.cautionKo, selected.cautionEn)}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => onStart(selectedId)}
          className={buttonClass({ variant: "solid", size: "lg", className: "min-h-11 w-full justify-center gap-2 sm:w-auto" })}
        >
          {bt("질문 시작하기", "Start the questions")}
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </button>
        <p className="mt-2 text-xs leading-[1.6] text-fg-3">
          {bt(
            "답하기 어려운 질문은 건너뛰어도 돼요. 빈칸은 초안에 빈칸으로 남아요.",
            "You can skip any question. Skipped answers stay blank in the draft.",
          )}
        </p>
      </div>
    </section>
  );
}
