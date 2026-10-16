import { useId } from "react";
import { Circle, CircleCheck, CircleHelp, ExternalLink, TriangleAlert, type LucideIcon } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  contractReviewItemStatus,
  getContractReviewSource,
  type ContractReviewAnswer,
  type ContractReviewItem,
  type ContractReviewItemStatus,
  type ContractReviewText,
} from "./contract-review-checklist";

const ANSWER_OPTIONS: readonly ContractReviewAnswer[] = ["present", "absent", "unsure"];

const STATUS_STYLE: Readonly<Record<ContractReviewItemStatus, { readonly icon: LucideIcon; readonly className: string }>> = {
  unchecked: { icon: Circle, className: "border-line bg-card text-fg-2" },
  unsure: { icon: CircleHelp, className: "border-cool/50 bg-cool/10 text-fg" },
  attention: { icon: TriangleAlert, className: "border-warn/60 bg-warning-soft text-fg" },
  fine: { icon: CircleCheck, className: "border-good/50 bg-good-soft text-fg" },
};

export interface ContractReviewItemCardProps {
  readonly item: ContractReviewItem;
  readonly answer: ContractReviewAnswer | undefined;
  /** 항목 제목의 제목 수준. 분류 제목보다 한 단계 아래다. */
  readonly headingLevel: 3 | 4;
  readonly onAnswer: (itemId: string, answer: ContractReviewAnswer | null) => void;
}

export function ContractReviewItemCard({ item, answer, headingLevel, onAnswer }: ContractReviewItemCardProps) {
  const bt = useBilingual("ContractReviewItemCard");
  const text = (value: ContractReviewText): string => bt(value.ko, value.en);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const promptId = `${baseId}-prompt`;
  const questionId = `${baseId}-question`;
  const Heading = headingLevel === 3 ? "h3" : "h4";

  const status = contractReviewItemStatus(item, answer);
  const statusStyle = STATUS_STYLE[status];
  const StatusIcon = statusStyle.icon;
  const statusLabel: Readonly<Record<ContractReviewItemStatus, string>> = {
    unchecked: bt("아직 확인 전", "Not checked yet"),
    unsure: bt("다시 확인 필요", "Needs another look"),
    attention: bt("먼저 확인하세요", "Check this first"),
    fine: bt("표시된 문제 신호 없음", "No flag"),
  };
  const answerLabel: Readonly<Record<ContractReviewAnswer, string>> = {
    present: bt("있어요", "It is in my contract"),
    absent: bt("없어요", "It is not in my contract"),
    unsure: bt("잘 모르겠어요", "I am not sure"),
  };

  return (
    <li
      data-contract-item={item.id}
      data-contract-status={status}
      className="scroll-mt-24 rounded-2xl border border-line bg-panel p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Heading id={titleId} className="min-w-0 flex-1 text-base font-bold leading-snug text-fg">
          {text(item.title)}
        </Heading>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.standardCore ? (
            <span className="rounded-full border border-line-strong px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2">
              {bt("표준계약서 핵심 조항", "Core clause in the standard")}
            </span>
          ) : null}
          <span
            data-contract-status-badge={status}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold",
              statusStyle.className,
            )}
          >
            <StatusIcon aria-hidden="true" className="size-3.5" />
            {statusLabel[status]}
          </span>
        </div>
      </div>

      <p id={questionId} className="mt-2 text-sm leading-relaxed text-fg-2">
        {text(item.question)}
      </p>

      <p id={promptId} className="mt-3 text-xs font-bold tracking-wide text-fg">
        {bt("내 계약서에 있나요?", "Is it in your contract?")}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${promptId} ${titleId}`}
        aria-describedby={questionId}
        className="mt-1.5 grid gap-2 sm:grid-cols-3"
      >
        {ANSWER_OPTIONS.map((option) => (
          <label
            key={option}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg",
              "hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/80",
            )}
          >
            <input
              type="radio"
              name={`${baseId}-answer`}
              value={option}
              checked={answer === option}
              onChange={() => onAnswer(item.id, option)}
              className="size-4 shrink-0 accent-accent"
            />
            <span>{answerLabel[option]}</span>
          </label>
        ))}
      </div>
      {answer !== undefined ? (
        <button
          type="button"
          onClick={() => onAnswer(item.id, null)}
          className="mt-2 inline-flex min-h-8 items-center rounded-md px-1 text-xs text-fg-2 underline underline-offset-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
        >
          {bt("이 항목 답 지우기", "Clear this answer")}
        </button>
      ) : null}

      {status === "attention" || status === "unsure" ? (
        <p className="mt-3 flex gap-2 rounded-xl border border-warn/40 bg-warning-soft p-3 text-sm leading-relaxed text-fg">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            <strong className="font-bold">{bt("다음 행동", "Next step")}</strong>
            {" · "}
            {text(item.attentionNote)}
          </span>
        </p>
      ) : null}

      <details className="mt-3 rounded-xl border border-line bg-card/60">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 py-2 text-sm font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80">
          {bt("표준계약서는 이렇게 다뤄요 · 내 계약서에서 볼 점", "How the standard contract handles it · what to look for")}
        </summary>
        <div className="space-y-3 border-t border-line px-3 py-3 text-sm leading-relaxed text-fg-2">
          <p>{text(item.standard)}</p>
          <div>
            <p className="font-semibold text-fg">{bt("내 계약서에서 볼 점", "What to look for in your contract")}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {item.lookFor.map((entry) => (
                <li key={entry.ko}>{text(entry)}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-fg">{bt("근거 문서 위치", "Where this comes from")}</p>
            <ul className="mt-1 space-y-1">
              {item.references.map((reference) => {
                const source = getContractReviewSource(reference.sourceId);
                return (
                  <li key={`${reference.sourceId}-${reference.locator.ko}`}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent underline underline-offset-2 hover:text-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
                    >
                      {text(reference.locator)}
                      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="sr-only">{bt("(새 창에서 열림)", "(opens in a new tab)")}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </details>
    </li>
  );
}
