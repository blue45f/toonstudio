import { useId, useRef } from "react";
import { ExternalLink, Scale } from "lucide-react";

import {
  CONTRACT_REVIEW_CATEGORIES,
  CONTRACT_REVIEW_CHECKED_ON,
  CONTRACT_REVIEW_ITEMS,
  CONTRACT_REVIEW_SOURCES,
  CONTRACT_REVIEW_STANDARD_EDITION,
  resolveContractReviewLocale,
  summarizeContractReview,
} from "@toonstudio/core/contract-review-checklist";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ContractReviewItemCard } from "./ContractReviewItemCard";
import { ContractReviewSummaryPanel } from "./ContractReviewSummaryPanel";
import { useContractReviewAnswers } from "./use-contract-review-answers";

export interface ContractReviewChecklistProps {
  /**
   * 체크리스트 안 큰 구획(진행 상황·분류·근거 문서) 제목의 수준.
   * 페이지 제목(h1) 바로 아래면 2, 이미 h2 가 있는 카드 안이면 3 을 준다. 항목 제목은 한 단계 더 낮다.
   */
  readonly headingLevel?: 2 | 3;
  readonly className?: string;
}

/**
 * 웹툰 계약서 검토 체크리스트 — 작가가 자기 계약서를 문화체육관광부 표준계약서와 해설집이 다루는
 * 항목에 하나씩 대조한다. 법률 자문이 아니며 답은 이 브라우저에만 저장한다.
 * 학습(`/learn/contract-checklist`)과 제작 관리(계약·정산 화면)가 같은 컴포넌트와 같은 저장 키를 쓴다.
 */
export function ContractReviewChecklist({ headingLevel = 2, className }: ContractReviewChecklistProps) {
  const bt = useBilingual("ContractReviewChecklist");
  const language = useI18n((state) => state.lang);
  const locale = resolveContractReviewLocale(language);
  const { answers, persistence, setAnswer, reset, retrySave } = useContractReviewAnswers();
  const summary = summarizeContractReview(answers);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const itemHeadingLevel = headingLevel === 2 ? 3 : 4;

  function focusItem(itemId: string): void {
    const root = rootRef.current;
    if (!root) return;
    const card = Array.from(root.querySelectorAll<HTMLElement>("[data-contract-item]")).find(
      (element) => element.dataset.contractItem === itemId,
    );
    if (!card) return;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
    const target = card.querySelector<HTMLInputElement>("input[type='radio']:checked")
      ?? card.querySelector<HTMLInputElement>("input[type='radio']");
    target?.focus({ preventScroll: true });
  }

  return (
    <div ref={rootRef} data-contract-review="" className={cn("space-y-6 text-fg", className)}>
      <div
        role="note"
        aria-labelledby={`${baseId}-disclaimer`}
        className="rounded-2xl border border-warn/40 bg-warning-soft p-4 sm:p-5"
      >
        <p id={`${baseId}-disclaimer`} className="flex items-center gap-2 text-sm font-bold text-fg">
          <Scale aria-hidden="true" className="size-4 shrink-0 text-warn" />
          {bt("법률 자문이 아니에요", "This is not legal advice")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg">
          {bt(
            "이 체크리스트는 문화체육관광부가 공개한 만화 분야 표준계약서와 해설집이 다루는 항목을 정리한 참고 자료입니다. 내 계약서가 유효한지·공정한지는 판단하지 않습니다. 서명하기 전에 변호사나 공공 상담 창구의 도움을 받으세요.",
            "This checklist organizes the topics covered by the comics-field standard contracts and commentary published by Korea's Ministry of Culture, Sports and Tourism. It does not judge whether your contract is valid or fair. Get help from a lawyer or a public advice service before you sign.",
          )}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-fg-2">
          {formatI18nTemplate(
            bt(
              "기준: 고시 제{notice}호({revised} 개정) 표준계약서와 2025년 해설집. 이후 개정은 확인하지 못했어요. 출처는 {checkedOn}에 직접 열어 확인했어요. 표준계약서는 확정된 계약서가 아니라 참고용 샘플이며, 표준과 다르다고 해서 항상 불리한 것은 아니에요.",
              "Basis: the standard contracts under Notice No. {notice} (revised {revised}) and the 2025 commentary. Later revisions were not checked. The sources were opened and checked on {checkedOn}. The standard contracts are reference samples, not finished contracts, and a term that differs from them is not always worse.",
            ),
            {
              notice: CONTRACT_REVIEW_STANDARD_EDITION.noticeNumber,
              revised: CONTRACT_REVIEW_STANDARD_EDITION.revisedOn,
              checkedOn: CONTRACT_REVIEW_CHECKED_ON,
            },
          )}
        </p>
      </div>

      <ContractReviewSummaryPanel
        summary={summary}
        answers={answers}
        persistence={persistence}
        locale={locale}
        headingLevel={headingLevel}
        onFocusItem={focusItem}
        onReset={reset}
        onRetrySave={retrySave}
      />

      {CONTRACT_REVIEW_CATEGORIES.map((category) => {
        const items = CONTRACT_REVIEW_ITEMS.filter((item) => item.category === category.id);
        const headingId = `${baseId}-${category.id}`;
        return (
          <section key={category.id} aria-labelledby={headingId}>
            <Heading id={headingId} className="text-lg font-bold text-fg">
              {bt(category.title.ko, category.title.en)}
            </Heading>
            <p className="mt-1 text-sm leading-relaxed text-fg-2">{bt(category.description.ko, category.description.en)}</p>
            <ol className="mt-3 space-y-3">
              {items.map((item) => (
                <ContractReviewItemCard
                  key={item.id}
                  item={item}
                  answer={answers[item.id]}
                  headingLevel={itemHeadingLevel}
                  onAnswer={setAnswer}
                />
              ))}
            </ol>
          </section>
        );
      })}

      <section aria-labelledby={`${baseId}-sources`} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <Heading id={`${baseId}-sources`} className="text-lg font-bold text-fg">
          {bt("근거 문서", "Sources")}
        </Heading>
        <p className="mt-1 text-sm leading-relaxed text-fg-2">
          {bt(
            "항목 설명은 아래 공개 문서를 직접 열어 확인한 내용만 담았어요. 문서가 개정되었을 수 있으니 서명 전에 최신본을 확인하세요.",
            "Item explanations only contain what was confirmed by opening the public documents below. They may have been revised, so check the latest version before you sign.",
          )}
        </p>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-fg-2">
          {CONTRACT_REVIEW_SOURCES.map((source) => (
            <li key={source.id}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-accent underline underline-offset-2 hover:text-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
              >
                {bt(source.title.ko, source.title.en)}
                <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="sr-only">{bt("(새 창에서 열림)", "(opens in a new tab)")}</span>
              </a>
              <p className="mt-0.5 text-xs leading-relaxed">
                {bt(source.publisher.ko, source.publisher.en)}
                {" · "}
                {formatI18nTemplate(bt("문서 날짜 {documentDate} · 확인일 {checkedOn}", "Document date {documentDate} · checked {checkedOn}"), {
                  documentDate: source.documentDate,
                  checkedOn: source.checkedOn,
                })}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed">{bt(source.note.ko, source.note.en)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
