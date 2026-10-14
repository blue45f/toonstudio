import { Eye, EyeOff, Flag, ShieldAlert } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";

import {
  buildMisclassificationReport,
  buildReactionSummary,
  classifyReaction,
  type MisclassificationReport,
  type ReactionCategory,
  type ReactionTopic,
} from "./reaction-summary";

import type { SeedReview } from "@/shared/lib/types";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type Bilingual = readonly [ko: string, en: string];

const CATEGORY_LABELS: Readonly<Record<ReactionCategory, Bilingual>> = {
  praise: ["칭찬·응원", "Praise & support"],
  work: ["작품 평가", "About the work"],
  critique: ["아쉬운 평가", "Critical takes"],
  attack: ["인신공격 (가려짐)", "Personal attacks (hidden)"],
  other: ["기타", "Other"],
};

const CATEGORY_ORDER: readonly ReactionCategory[] = ["praise", "work", "critique", "attack", "other"];

const TOPIC_LABELS: Readonly<Record<ReactionTopic, Bilingual>> = {
  art: ["작화·연출", "Art & direction"],
  story: ["스토리", "Story"],
  character: ["캐릭터", "Characters"],
  pacing: ["전개 속도", "Pacing"],
  serialization: ["연재·분량", "Release cadence"],
};

const BAR_TONE: Readonly<Record<ReactionCategory, string>> = {
  praise: "bg-good",
  work: "bg-accent",
  critique: "bg-warn",
  attack: "bg-bad",
  other: "bg-line-strong",
};

/**
 * 악성 댓글 방벽 — 반응 요약 패널 (REPORT O-5).
 *
 * 기본 상태에서는 분류·집계 요약만 보여 주고 원본 댓글 텍스트는 대표 반응(비공격 카테고리)
 * 발췌 외에는 렌더하지 않는다. 원본 목록은 '원본 댓글 보기'를 명시적으로 눌렀을 때만 열리며,
 * 그 안에서도 인신공격으로 분류된 댓글은 원본을 DOM에 넣지 않고 가린 행으로만 표시한다.
 * 분류가 실제와 다르면 항목별 '분류가 달라요'로 오분류 신고를 남길 수 있고,
 * 신고된 재분류는 이 화면의 요약에 즉시 반영된다.
 */
export function ReactionSummaryPanel({
  reviews,
  onReportMisclassification,
}: {
  readonly reviews: readonly SeedReview[];
  readonly onReportMisclassification?: (report: MisclassificationReport) => void;
}) {
  const bt = useBilingual("domains.community.ReactionSummaryPanel");
  const [originalsOpen, setOriginalsOpen] = useState(false);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, ReactionCategory>>(new Map());
  const [reportedIds, setReportedIds] = useState<ReadonlySet<string>>(new Set());
  const [reportOpenFor, setReportOpenFor] = useState<string | null>(null);
  const [claimedDraft, setClaimedDraft] = useState<ReactionCategory>("work");

  const summary = useMemo(() => buildReactionSummary(reviews, overrides), [reviews, overrides]);

  const submitReport = (review: SeedReview, classifiedAs: ReactionCategory) => {
    if (claimedDraft === classifiedAs) return;
    const report = buildMisclassificationReport({ reviewId: review.id, classifiedAs, claimedAs: claimedDraft });
    onReportMisclassification?.(report);
    setOverrides((previous) => new Map(previous).set(review.id, claimedDraft));
    setReportedIds((previous) => new Set(previous).add(review.id));
    setReportOpenFor(null);
  };

  if (reviews.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-card p-5 text-sm text-fg-3">
        {bt("요약할 댓글이 아직 없어요.", "There are no comments to summarize yet.")}
      </p>
    );
  }

  return (
    <section aria-label={bt("독자 반응 요약", "Reader reaction summary")} className="flex flex-col gap-5">
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="text-base font-semibold text-fg">{bt("반응 요약으로 보기", "Reaction summary")}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-3">
          {bt(
            "댓글을 감정·주제별로 분류해 집계만 보여줘요. 원본은 아래에서 직접 열 때만 볼 수 있고, 인신공격으로 분류된 댓글은 원본을 표시하지 않습니다. 분류는 규칙 기반 1차 판정이라 실제와 다를 수 있어요 — 항목별 '분류가 달라요'로 알려 주세요.",
            "Comments are classified by sentiment and topic and shown only as aggregates. Originals appear only when you open them below, and comments classified as personal attacks are never shown in full. Classification is a first-pass rules-based guess and can be wrong — use “Wrong category” on any item to report it.",
          )}
        </p>

        <ul className="mt-4 flex flex-col gap-2.5">
          {CATEGORY_ORDER.map((category) => (
            <li key={category} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs font-medium text-fg-2">{bt(...CATEGORY_LABELS[category])}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <span
                  className={cn("block h-full rounded-full", BAR_TONE[category])}
                  style={{ width: `${Math.round(summary.shares[category] * 100)}%` }}
                />
              </span>
              <span className="numeral tnum w-14 shrink-0 text-right text-xs text-fg-3">
                {summary.counts[category].toLocaleString("ko-KR")}
                {bt("개", "")} · {Math.round(summary.shares[category] * 100)}%
              </span>
            </li>
          ))}
        </ul>

        {summary.topics.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label={bt("주제별 반응", "Reactions by topic")}>
            {summary.topics.map(({ topic, count }) => (
              <span key={topic} className="rounded-md bg-raised px-2 py-1 text-xs text-fg-2">
                {bt(...TOPIC_LABELS[topic])} · {count.toLocaleString("ko-KR")}
              </span>
            ))}
          </div>
        ) : null}

        {summary.shieldedCount > 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-bad/10 px-3 py-2.5 text-sm text-fg-2" role="note">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden="true" />
            <span>
              {bt(
                `인신공격으로 분류된 댓글 ${summary.shieldedCount}개는 원본을 보여주지 않아요. 작품에 대한 비판은 위 집계에 그대로 포함돼 있습니다.`,
                `${summary.shieldedCount} comment(s) classified as personal attacks are not shown in full. Criticism of the work itself is still included in the aggregates above.`,
              )}
            </span>
          </p>
        ) : null}
      </div>

      {summary.highlights.length > 0 ? (
        <div className="rounded-2xl border border-line bg-card p-5">
          <h4 className="text-sm font-semibold text-fg">{bt("대표 반응", "Representative reactions")}</h4>
          <ul className="mt-3 flex flex-col gap-3">
            {summary.highlights.map((highlight) => (
              <li key={highlight.reviewId} className="rounded-xl bg-raised/60 px-3.5 py-3">
                <p className="text-pretty text-sm leading-relaxed text-fg-2">{highlight.excerpt}</p>
                <p className="mt-1.5 text-xs text-fg-3">
                  {highlight.author} · ★ {highlight.rating.toFixed(1)} · {bt(...CATEGORY_LABELS[highlight.category])}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-2xl border border-line bg-card p-5">
        <button
          type="button"
          aria-expanded={originalsOpen}
          onClick={() => setOriginalsOpen((open) => !open)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3.5 py-2 text-sm font-medium text-fg-2 transition-colors hover:text-fg"
        >
          {originalsOpen ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          {originalsOpen ? bt("원본 댓글 접기", "Hide original comments") : bt("원본 댓글 보기", "Show original comments")}
        </button>

        {originalsOpen ? (
          <ul className="mt-4 flex flex-col gap-3">
            {reviews.map((review) => {
              const classifiedAs = overrides.get(review.id) ?? classifyReaction(review).category;
              const shielded = classifiedAs === "attack";
              const reported = reportedIds.has(review.id);
              return (
                <li key={review.id} className="rounded-xl border border-line px-3.5 py-3">
                  {shielded ? (
                    <p className="flex items-center gap-2 text-sm text-fg-3">
                      <ShieldAlert size={14} className="shrink-0 text-bad" aria-hidden="true" />
                      {bt(
                        "인신공격으로 분류되어 가려진 댓글이에요. 원본은 표시하지 않습니다.",
                        "Hidden as a personal attack. The original text is not shown.",
                      )}
                    </p>
                  ) : (
                    <p className="text-pretty text-sm leading-relaxed text-fg-2">{review.text}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-3">
                    <span>{review.author}</span>
                    <span className="rounded-md bg-raised px-1.5 py-0.5">{bt(...CATEGORY_LABELS[classifiedAs])}</span>
                    {reported ? (
                      <span role="status" className="text-good">
                        {bt("분류 신고가 접수됐어요", "Category report received")}
                      </span>
                    ) : reportOpenFor === review.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <label className="sr-only" htmlFor={`reaction-claim-${review.id}`}>
                          {bt("실제 분류", "Actual category")}
                        </label>
                        <select
                          id={`reaction-claim-${review.id}`}
                          value={claimedDraft}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) => setClaimedDraft(event.target.value as ReactionCategory)}
                          className="min-h-9 rounded-md border border-line bg-canvas px-2 py-1 text-xs text-fg"
                        >
                          {CATEGORY_ORDER.filter((category) => category !== classifiedAs).map((category) => (
                            <option key={category} value={category}>
                              {bt(...CATEGORY_LABELS[category])}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => submitReport(review, classifiedAs)}
                          className="min-h-9 rounded-md bg-accent px-2.5 py-1 font-medium text-on-accent"
                        >
                          {bt("신고 보내기", "Send report")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReportOpenFor(null)}
                          className="min-h-9 rounded-md px-2 py-1 text-fg-3 hover:text-fg-2"
                        >
                          {bt("취소", "Cancel")}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setReportOpenFor(review.id);
                          setClaimedDraft(classifiedAs === "work" ? "praise" : "work");
                        }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 py-1 font-medium text-fg-3 transition-colors hover:text-fg"
                      >
                        <Flag size={12} aria-hidden="true" />
                        {bt("분류가 달라요", "Wrong category")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
