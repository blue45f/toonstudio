import { useId, useState } from "react";
import { ClipboardCopy, Download, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { copyText } from "@/shared/lib/copy-text";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { ContractReviewPersistence } from "./contract-review-answer-store";
import {
  CONTRACT_REVIEW_ITEMS,
  buildContractReviewMarkdown,
  type ContractReviewAnswers,
  type ContractReviewLocale,
  type ContractReviewSummary,
} from "./contract-review-checklist";
import { contractReviewFilename, downloadTextFile } from "./contract-review-export";

export interface ContractReviewSummaryPanelProps {
  readonly summary: ContractReviewSummary;
  readonly answers: ContractReviewAnswers;
  readonly persistence: ContractReviewPersistence;
  readonly locale: ContractReviewLocale;
  readonly headingLevel: 2 | 3;
  readonly onFocusItem: (itemId: string) => void;
  readonly onReset: () => void;
  readonly onRetrySave: () => void;
}

interface Feedback {
  readonly kind: "info" | "error";
  readonly message: string;
}

export function ContractReviewSummaryPanel({
  summary,
  answers,
  persistence,
  locale,
  headingLevel,
  onFocusItem,
  onReset,
  onRetrySave,
}: ContractReviewSummaryPanelProps) {
  const bt = useBilingual("ContractReviewSummaryPanel");
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const progressId = `${baseId}-progress`;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDate] = useState(() => new Date());

  const flagged = CONTRACT_REVIEW_ITEMS.filter((item) => summary.attentionIds.includes(item.id));

  function handleDownload(): void {
    const generatedAt = new Date();
    const markdown = buildContractReviewMarkdown({ answers, locale, generatedAt });
    const started = downloadTextFile(contractReviewFilename(generatedAt), markdown);
    setFeedback(
      started
        ? {
            kind: "info",
            message: bt(
              "요약을 내려받았어요. 이 브라우저 안에서만 만들었고 서버로 보내지 않았어요.",
              "The summary was downloaded. It was built in this browser only and nothing was sent to a server.",
            ),
          }
        : {
            kind: "error",
            message: bt(
              "내려받기를 시작하지 못했어요. ‘요약 복사’로 내용을 붙여 넣어 보관해 주세요.",
              "Could not start the download. Use “Copy summary” and paste it somewhere safe.",
            ),
          },
    );
  }

  async function handleCopy(): Promise<void> {
    const copied = await copyText(buildContractReviewMarkdown({ answers, locale, generatedAt: new Date() }));
    setFeedback(
      copied
        ? { kind: "info", message: bt("요약을 복사했어요.", "The summary was copied.") }
        : {
            kind: "error",
            message: bt(
              "복사하지 못했어요. ‘요약 미리 보기’를 열어 직접 선택해 복사해 주세요.",
              "Could not copy. Open “Preview summary” and select the text to copy it yourself.",
            ),
          },
    );
  }

  function handleResetClick(): void {
    if (!confirmingReset) {
      setConfirmingReset(true);
      setFeedback({
        kind: "info",
        message: bt(
          "한 번 더 누르면 이 브라우저에 저장된 모든 답이 지워져요.",
          "Press once more to erase every answer saved in this browser.",
        ),
      });
      return;
    }
    setConfirmingReset(false);
    onReset();
    setFeedback({ kind: "info", message: bt("모든 답을 지웠어요.", "All answers were cleared.") });
  }

  function handleResetCancel(): void {
    setConfirmingReset(false);
    setFeedback(null);
  }

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <Heading id={titleId} className="text-lg font-bold text-fg">
        {bt("내 진행 상황", "Your progress")}
      </Heading>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <progress
          aria-labelledby={progressId}
          value={summary.answered}
          max={Math.max(summary.total, 1)}
          className="h-2 min-w-40 flex-1 overflow-hidden rounded-full accent-accent"
        />
        <p id={progressId} className="text-sm font-semibold text-fg">
          {formatI18nTemplate(bt("{answered} / {total}개 답함 ({percent}%)", "{answered} of {total} answered ({percent}%)"), {
            answered: summary.answered,
            total: summary.total,
            percent: summary.progressPercent,
          })}
        </p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-2">
        {formatI18nTemplate(
          bt(
            "계약서에 있음 {present} · 없음 {absent} · 잘 모르겠음 {unsure} · 아직 확인 전 {unchecked}",
            "In my contract {present} · Not in my contract {absent} · Not sure {unsure} · Not checked yet {unchecked}",
          ),
          { present: summary.present, absent: summary.absent, unsure: summary.unsure, unchecked: summary.unchecked },
        )}
      </p>

      <div className="mt-4">
        <p className="text-sm font-bold text-fg">
          {formatI18nTemplate(bt("먼저 확인할 항목 {count}개", "Items to check first: {count}"), { count: flagged.length })}
        </p>
        {flagged.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {flagged.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onFocusItem(item.id)}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-fg underline underline-offset-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 pointer-coarse:min-h-11"
                >
                  <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-warn" />
                  {bt(item.title.ko, item.title.en)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm leading-relaxed text-fg-2">
            {summary.answered === 0
              ? bt(
                  "아래 질문에 답하면 먼저 확인할 항목이 여기에 모여요.",
                  "Answer the questions below and the items to check first will be collected here.",
                )
              : bt(
                  "지금까지 답한 항목에서는 표시된 문제 신호가 없어요. 그래도 이 목록은 표준계약서가 다루는 주제만 점검하므로, 서명 전 전문가 상담은 여전히 권해요.",
                  "No flags so far. This list only covers topics in the standard contracts, so we still recommend expert advice before you sign.",
                )}
          </p>
        )}
        {summary.unsure > 0 || summary.unchecked > 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-2">
            {formatI18nTemplate(
              bt(
                "‘잘 모르겠음’ {unsure}개와 아직 확인하지 않은 {unchecked}개도 요약의 ‘먼저 확인할 항목’에 포함돼요.",
                "The {unsure} “not sure” items and {unchecked} unchecked items are also listed under “Check these first” in the summary.",
              ),
              { unsure: summary.unsure, unchecked: summary.unchecked },
            )}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={handleDownload}>
          <Download aria-hidden="true" className="size-4" />
          {bt("요약 내려받기 (.md)", "Download summary (.md)")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
          <ClipboardCopy aria-hidden="true" className="size-4" />
          {bt("요약 복사", "Copy summary")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={confirmingReset ? "outline" : "quiet"}
          onClick={handleResetClick}
          disabled={summary.answered === 0}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          {confirmingReset ? bt("정말 모두 지우기", "Yes, clear everything") : bt("답 모두 지우기", "Clear all answers")}
        </Button>
        {confirmingReset ? (
          <Button type="button" size="sm" variant="ghost" onClick={handleResetCancel}>
            {bt("취소", "Cancel")}
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-3">
        {bt(
          "답은 이 브라우저에만 저장되고 서버로 보내지 않아요. 요약 파일은 한국어로 만들어져요.",
          "Answers stay in this browser and are never sent to a server. The summary file is written in English.",
        )}
      </p>

      {/* 안내와 오류는 각각 항상 DOM 에 있는 알림 영역에 담아, 내용이 바뀔 때 보조기기가 읽도록 한다. */}
      <p role="status" className="mt-2 min-h-5 text-sm text-fg-2">
        {feedback?.kind === "info" ? feedback.message : ""}
      </p>
      <p role="alert" className="text-sm text-bad">
        {feedback?.kind === "error" ? feedback.message : ""}
      </p>

      {persistence !== "saved" ? (
        <div role={persistence === "failed" ? "alert" : "status"} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 bg-warning-soft p-3 text-sm text-fg">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 leading-relaxed">
            {persistence === "unavailable"
              ? bt(
                  "이 브라우저에서는 답을 저장할 수 없어요. 이 화면을 닫으면 답이 사라지니 먼저 요약을 내려받아 보관해 주세요.",
                  "This browser cannot save your answers. They are lost when you close this page, so download the summary first.",
                )
              : bt(
                  "답을 저장하지 못했어요(저장 공간이 가득 찼거나 막혔을 수 있어요). 요약을 내려받아 두거나 다시 저장해 보세요.",
                  "Your answers could not be saved (storage may be full or blocked). Download the summary or try saving again.",
                )}
          </p>
          {persistence === "failed" ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetrySave}>
              {bt("다시 저장", "Try saving again")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <details
        className="mt-4 rounded-xl border border-line bg-panel"
        onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 py-2 text-sm font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80">
          {bt("요약 미리 보기", "Preview summary")}
        </summary>
        {previewOpen ? (
          <pre
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 길게 넘치는 요약을 키보드만으로 읽을 수 있어야 하므로 스크롤 영역에 포커스가 필요하다(WCAG 2.1.1).
            tabIndex={0}
            aria-label={bt("요약 Markdown 미리 보기", "Markdown summary preview")}
            lang={locale}
            className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-line p-3 text-xs leading-relaxed text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
          >
            {buildContractReviewMarkdown({ answers, locale, generatedAt: previewDate })}
          </pre>
        ) : null}
      </details>
    </section>
  );
}
