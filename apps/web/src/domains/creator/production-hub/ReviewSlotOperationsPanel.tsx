/**
 * 검수 슬롯 운영 패널 — 작품당 검수 시간을 눈으로 확보하는 표면.
 *
 * 코미코 PD 집단 검수는 작품마다 1시간 이상의 슬롯을 먼저 잡아 뒀다.
 * 비동기 검수에서 그 슬롯은 검수 정책의 응답 기한(responseDueHours)으로
 * 표현된다: 검수 요청 시각 + 응답 기한 = 이 작품의 검수 마감. 이 패널은
 * 그 기한을 항상 보이게 하고(기한 표시), 넘기면 정책이 정한 다음 조치
 * (expiredReviewAction)를 에스컬레이션 문구로 펼친다.
 *
 * 이 부품은 표시와 실행 콜백(onEscalate)만 맡는다. 상향 보고·검수자 교체·
 * 일정 재조정의 실제 실행(알림·배정 변경)은 호스트가 맡으며, 패널은
 * 실행된 척하지 않는다 — 콜백이 없으면 조치 문구만 보여 준다.
 */
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  reviewSlotRemainingLabel,
  type ReviewSlot,
  type ReviewerSlotRow,
} from "./review-slot-operations-model";

const ROW_STATE_CLASS: Readonly<Record<ReviewerSlotRow["state"], string>> = Object.freeze({
  responded: "border-line bg-card text-fg-2",
  awaiting: "border-line bg-card text-fg-3",
  "due-soon": "border-line bg-panel font-bold text-fg",
  overdue: "border-line bg-panel font-bold text-fg",
});

function ReviewerSlotRowView({ row }: { readonly row: ReviewerSlotRow }) {
  const bt = useBilingual("ReviewSlotOperationsPanel");
  const stateLabel = row.state === "responded"
    ? row.respondedLate
      ? bt("판정 완료 · 기한 넘겨 답변", "Verdict in · answered late")
      : bt("판정 완료", "Verdict in")
    : row.state === "overdue"
      ? bt("기한 초과 · 답변 없음", "Overdue · no answer")
      : row.state === "due-soon"
        ? bt("기한 임박 · 답변 대기", "Due soon · waiting")
        : bt("답변 대기", "Waiting");
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5">
      <p className="text-sm font-bold text-fg">{row.displayName}</p>
      <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] text-fg-3">
        {bt(row.laneLabel.ko, row.laneLabel.en)}
      </span>
      {row.required ? (
        <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] font-bold text-fg-2">
          {bt("필수 검수자", "Required")}
        </span>
      ) : null}
      <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[0.7rem]", ROW_STATE_CLASS[row.state])}>
        {stateLabel}
      </span>
    </li>
  );
}

export interface ReviewSlotOperationsPanelProps {
  readonly slot: ReviewSlot | null;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  /**
   * 에스컬레이션 실행 콜백(상향 보고·교체·재조정 중 정책이 정한 조치).
   * 없으면 에스컬레이션은 문구로만 안내한다.
   */
  readonly onEscalate?: (slot: ReviewSlot) => void;
  /** 비교 검수 화면으로 가는 경로. 있으면 진입 버튼을 단다. */
  readonly compareHref?: string;
}

export function ReviewSlotOperationsPanel({
  slot,
  loading,
  error,
  onRetry,
  onEscalate,
  compareHref,
}: ReviewSlotOperationsPanelProps) {
  const bt = useBilingual("ReviewSlotOperationsPanel");

  if (loading) {
    return (
      <section aria-label={bt("검수 슬롯", "Review slot")} className="rounded-2xl border border-line bg-card p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-panel" />
        <div className="mt-3 h-16 animate-pulse rounded-xl bg-panel" />
        <p className="mt-3 text-xs text-fg-3">{bt("검수 기한을 확인하고 있어요.", "Checking the review deadline.")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label={bt("검수 슬롯", "Review slot")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-bold text-fg">{bt("검수 슬롯을 불러오지 못했어요.", "Couldn't load the review slot.")}</p>
        <p className="mt-1 text-sm leading-6 text-fg-2">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}>
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
      </section>
    );
  }

  if (!slot || slot.phase === "no-policy") {
    return (
      <section aria-label={bt("검수 슬롯", "Review slot")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-black text-fg">{bt("검수 슬롯", "Review slot")}</p>
        <p className="mt-1.5 text-sm leading-6 text-fg-2">
          {bt(
            "아직 이 회차에 검수 정책이 없어서 응답 기한이 정해지지 않았어요. 검수 정책에서 응답 기한을 정하면, 작품마다 검수 시간이 슬롯으로 확보돼요.",
            "This episode has no review policy yet, so there's no response deadline. Set a response window in the review policy, and every work gets a secured review slot.",
          )}
        </p>
      </section>
    );
  }

  if (slot.phase === "not-started") {
    return (
      <section aria-label={bt("검수 슬롯", "Review slot")} className="rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-black text-fg">{bt("검수 슬롯", "Review slot")}</p>
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] text-fg-3">
            {bt(slot.phaseLabel.ko, slot.phaseLabel.en)}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-6 text-fg-2">
          {bt(
            `검수를 요청하면 그 시각부터 ${slot.responseDueHours}시간의 응답 기한이 이 작품의 검수 슬롯으로 잡혀요.`,
            `When review is requested, a ${slot.responseDueHours}h response window becomes this work's review slot.`,
          )}
        </p>
        {compareHref ? (
          <div className="mt-3">
            <Link to={compareHref} className={buttonClass({ size: "sm", className: "min-h-11" })}>
              {bt("비교 검수 열기", "Open compare review")}
            </Link>
          </div>
        ) : null}
      </section>
    );
  }

  const remaining = reviewSlotRemainingLabel(slot);
  const elapsedPercent = Math.round((slot.elapsedRatio ?? 0) * 100);

  return (
    <section aria-label={bt("검수 슬롯", "Review slot")} className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-fg">{bt("검수 슬롯", "Review slot")}</p>
        <span
          data-phase={slot.phase}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[0.7rem] font-bold",
            slot.phase === "overdue" || slot.phase === "due-soon"
              ? "border-accent bg-accent-soft text-fg"
              : "border-line bg-card text-fg-2",
          )}
        >
          {bt(slot.phaseLabel.ko, slot.phaseLabel.en)}
        </span>
        {compareHref ? (
          <Link to={compareHref} className={buttonClass({ size: "sm", className: "ml-auto min-h-11" })}>
            {bt("비교 검수에서 보기", "Open in compare review")}
          </Link>
        ) : null}
      </div>

      {/* 기한 표시: 요청 시각부터 응답 기한까지가 이 작품의 검수 슬롯이다. */}
      <div className="mt-3 rounded-xl border border-line bg-panel p-3">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-fg">
          <CalendarClock className="size-4" aria-hidden="true" />
          {slot.dueLabel ? bt(slot.dueLabel.ko, slot.dueLabel.en) : null}
          {remaining ? <span className="text-fg-2">· {bt(remaining.ko, remaining.en)}</span> : null}
        </p>
        <p className="mt-1 text-xs text-fg-3">
          {bt(
            `검수 요청부터 ${slot.responseDueHours}시간 안에 답해야 하는 슬롯이에요.`,
            `Reviewers answer within ${slot.responseDueHours}h of the request.`,
          )}
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={elapsedPercent}
          aria-label={bt("슬롯 경과 비율", "Slot elapsed")}
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-card"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${elapsedPercent}%` }} />
        </div>
      </div>

      {/* 기한 초과 시 에스컬레이션: 정책 expiredReviewAction을 문구로 펼친다. */}
      {slot.escalation ? (
        <div role="alert" className="mt-3 rounded-xl border border-accent bg-accent-soft p-3">
          <p className="text-sm font-black text-fg">{bt(slot.escalation.headline.ko, slot.escalation.headline.en)}</p>
          <p className="mt-1 text-sm leading-6 text-fg-2">{bt(slot.escalation.guidance.ko, slot.escalation.guidance.en)}</p>
          {slot.escalation.pendingRequiredNames.length > 0 ? (
            <p className="mt-1.5 text-xs text-fg-2">
              {bt(
                `아직 답하지 않은 필수 검수자: ${slot.escalation.pendingRequiredNames.join(", ")}`,
                `Required reviewers who haven't answered: ${slot.escalation.pendingRequiredNames.join(", ")}`,
              )}
            </p>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] font-bold text-fg-2">
              {bt(`정책 조치 · ${slot.escalation.actionLabel.ko}`, `Policy action · ${slot.escalation.actionLabel.en}`)}
            </span>
            {onEscalate ? (
              <button type="button" onClick={() => onEscalate(slot)} className={buttonClass({ size: "sm", className: "min-h-11" })}>
                {bt(slot.escalation.cta.ko, slot.escalation.cta.en)}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {slot.rows.map((row) => (
          <ReviewerSlotRowView key={row.assignmentId} row={row} />
        ))}
      </ul>
    </section>
  );
}
