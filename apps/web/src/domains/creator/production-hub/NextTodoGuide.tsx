/**
 * '다음 할 일' 통합 안내 — 표시 UI (작업 흐름 연속성 레인).
 *
 * 집계 모델(next-todo-guide-model)이 우선순위 순으로 모은 다음 행동을
 * 작품 허브(개요)와 홈(제작 랜딩)에서 같은 모양으로 보여 준다. 1차 행동은
 * 목록 맨 위 항목 하나뿐이고, 나머지는 그 아래 차분히 쌓인다(화면 복잡도
 * 기준: 한 화면의 1차 행동은 하나). 항목마다 "왜 지금 해야 하는지"(reason)를
 * 함께 말해 사용자가 순서를 납득할 수 있게 한다.
 *
 * 빈 상태는 숨기지 않는다: 할 일이 없으면 없다고 말하고, 다음으로 갈 곳
 * (허브는 회차 표면, 홈은 작품 시작) 하나만 제안한다. 근거 없는 행동을
 * 지어내 채우지 않는다.
 */
import { ArrowRight, CheckCircle2, ListTodo } from "lucide-react";
import { Link } from "react-router-dom";

import type { NextTodoGuide as NextTodoGuideData, NextTodoKind } from "./next-todo-guide-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const KIND_TONE_CLASS: Readonly<Record<NextTodoKind, string>> = Object.freeze({
  blocker: "border-bad/40 bg-bad/10 text-fg",
  "changes-requested": "border-bad/40 bg-bad/10 text-fg",
  "overdue-task": "border-bad/40 bg-bad/10 text-fg",
  "blocked-task": "border-bad/40 bg-bad/10 text-fg",
  "release-soon": "border-line bg-accent-soft text-fg",
  "review-task": "border-line bg-card text-fg",
  "due-task": "border-line bg-card text-fg",
  "episode-stage": "border-accent bg-accent-soft text-fg",
  inbox: "border-line bg-card text-fg",
  "project-risk": "border-line bg-card text-fg",
});

export interface NextTodoGuideProps {
  readonly guide: NextTodoGuideData;
  /** 빈 상태의 유일한 제안. 없으면 제안 없이 빈 상태 문구만 보인다. */
  readonly emptyAction?: { readonly label: { readonly ko: string; readonly en: string }; readonly href: string } | null;
}

export function NextTodoGuide({ guide, emptyAction }: NextTodoGuideProps) {
  const bt = useBilingual("NextTodoGuide");
  const hiddenCount = guide.totalCount - guide.items.length;

  return (
    <section
      aria-labelledby="next-todo-guide-title"
      className="rounded-2xl border border-line bg-card p-4"
    >
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <ListTodo className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="next-todo-guide-title" className="text-sm font-black text-fg">
            {bt("다음 할 일", "What to do next")}
          </h2>
          <p className="text-xs text-fg-3">
            {guide.isEmpty
              ? bt("여러 회차·단계에서 모은 다음 행동", "Next actions gathered across episodes and stages")
              : bt(
                  `급한 순서대로 ${guide.totalCount}건`,
                  `${guide.totalCount} action(s), most urgent first`,
                )}
          </p>
        </div>
      </header>

      {guide.isEmpty ? (
        <div className="mt-3 rounded-xl border border-dashed border-line p-5 text-center">
          <CheckCircle2 className="mx-auto size-5 text-accent" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-fg">{bt("지금 할 일이 없어요", "Nothing to do right now")}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-fg-3">
            {bt(
              "막힌 회차도, 임박한 마감도 없어요. 새 회차를 시작하거나 지난 회차를 돌아보세요.",
              "No blocked episodes and no near deadlines. Start a new episode or look back at past ones.",
            )}
          </p>
          {emptyAction ? (
            <Link
              to={emptyAction.href}
              className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-11 gap-1.5" })}
            >
              {bt(emptyAction.label.ko, emptyAction.label.en)}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : (
        <ol className="mt-3 space-y-2">
          {guide.items.map((item, index) => (
            <li key={item.id}>
              <Link
                to={item.href}
                className={cn(
                  "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 outline-none transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                  KIND_TONE_CLASS[item.kind],
                  index === 0 ? "border-accent" : undefined,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">{item.title}</span>
                  <span className="block truncate text-xs text-fg-3">{bt(item.reason.ko, item.reason.en)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-black text-accent">
                  {bt(item.actionLabel.ko, item.actionLabel.en)}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {!guide.isEmpty && hiddenCount > 0 ? (
        <p className="mt-2 text-right text-xs text-fg-3">
          {bt(`외 ${hiddenCount}건은 각 회차·공정 화면에서 이어집니다`, `${hiddenCount} more continue in each episode and board view`)}
        </p>
      ) : null}
    </section>
  );
}
