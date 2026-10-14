/**
 * 다인 검수 합의 패널 — PD 집단 검수를 비동기로 옮긴 합의 표면.
 *
 * 코미코 덩크스튜디오의 PD 집단 검수는 회의에서 끝나면 의견이 흩어졌다.
 * 이 패널은 검수자마다 판정(승인/조건부/수정 요청/거부/대기)과 그 사람이
 * 그림 위에 단 핀을 한 행으로 묶어 보여 주고, 맨 위에 합의 상태를 한
 * 단어로 세운다. 호스트가 currentAssignmentId와 onRegisterDecision을
 * 주면, 로그인한 검수자 본인의 행에 판정 입력 폼이 붙어 그 자리에서
 * 판정과 근거 핀을 바로 등록할 수 있다(다른 사람 이름으로는 등록할 수
 * 없다). 검증은 단계 합의 게이트와 같은 사유 검증
 * (multi-reviewer-consensus-decision-model이 validateStageGateDecision에
 * 위임)을 쓰고, 저장은 호스트가 맡는다 — 등록이 끝나 aggregate가
 * 갱신되면 요약은 그대로 따라온다. 두 prop이 없으면 표시 전용이다.
 *
 * - 검수자가 없으면 오류가 아니라 빈 상태로 안내한다.
 * - 핀은 행 안에서 바로 눌러 비교 검수 화면의 그 핀으로 이동할 수 있다
 *   (onSelectPin). 콜백이 없으면 핀은 개수만 보여 준다.
 * - 조건부 승인의 조건은 행 안에 원문 그대로 펼친다.
 */
import { useState } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { ReviewDecisionValue } from "@toonstudio/core/production";

import {
  buildConsensusDecisionSubmission,
  parseConsensusConditions,
  validateConsensusDecision,
  CONSENSUS_REGISTERABLE_DECISIONS,
  type ConsensusDecisionDraft,
  type ConsensusDecisionSubmission,
} from "./multi-reviewer-consensus-decision-model";
import type {
  ConsensusPinRef,
  ConsensusState,
  ReviewerConsensusRow,
  ReviewerConsensusSummary,
} from "./multi-reviewer-consensus-model";
import { REVIEW_DECISION_LABELS, reviewDecisionTone } from "./production-labels";

const STATE_BANNER_CLASS: Readonly<Record<ConsensusState, string>> = Object.freeze({
  approved: "border-line bg-accent-soft",
  "approved-with-conditions": "border-line bg-accent-soft",
  "changes-requested": "border-line bg-panel",
  vetoed: "border-line bg-panel",
  awaiting: "border-line bg-panel",
  "no-reviewers": "border-line bg-panel",
});

function PinChips({
  row,
  onSelectPin,
}: {
  readonly row: ReviewerConsensusRow;
  readonly onSelectPin?: (pin: ConsensusPinRef) => void;
}) {
  const bt = useBilingual("MultiReviewerConsensusPanel");
  if (row.pins.length === 0) {
    return <p className="text-xs text-fg-3">{bt("단 핀이 없어요.", "No pins placed.")}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.pins.map((pin) => {
        const label = bt(`핀 ${pin.number}`, `Pin ${pin.number}`);
        const className = cn(
          "rounded-full border px-2 py-0.5 text-[0.7rem]",
          pin.status === "urgent"
            ? "border-accent bg-accent-soft font-bold text-fg"
            : pin.status === "resolved"
              ? "border-line bg-card text-fg-3"
              : "border-line bg-card text-fg-2",
        );
        return onSelectPin ? (
          <button key={pin.threadId} type="button" className={className} onClick={() => onSelectPin(pin)}>
            {label}
            {pin.status === "resolved" ? bt(" · 해결", " · resolved") : ""}
          </button>
        ) : (
          <span key={pin.threadId} className={className}>
            {label}
            {pin.status === "resolved" ? bt(" · 해결", " · resolved") : ""}
          </span>
        );
      })}
      {row.openPinCount > 0 ? (
        <span className="text-[0.7rem] text-fg-3">
          {bt(`미해결 ${row.openPinCount}개`, `${row.openPinCount} open`)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 내 행에 붙는 판정 입력 폼. 판정 4종(승인/조건부/수정 요청/거부) 중
 * 하나를 고르고, 사유·조건·근거 핀을 붙여 바로 등록한다. 검증은
 * 게이트와 같은 사유 검증이라, 사유 없는 반려·조건 없는 조건부 승인은
 * 등록 버튼이 잠긴 채 이유가 그 자리에 보인다. 핀은 이 검수자가 이미
 * 단 핀 중에서 고른다 — 새 핀은 비교 검수 화면에서 좌표와 함께 단다.
 */
function ConsensusDecisionForm({
  row,
  registering,
  registerError,
  onRegisterDecision,
}: {
  readonly row: ReviewerConsensusRow;
  readonly registering?: boolean;
  readonly registerError?: string | null;
  readonly onRegisterDecision: (submission: ConsensusDecisionSubmission) => void | Promise<void>;
}) {
  const bt = useBilingual("MultiReviewerConsensusPanel");
  const [value, setValue] = useState<ReviewDecisionValue>("approve");
  const [reason, setReason] = useState("");
  const [conditionsText, setConditionsText] = useState("");
  const [pinThreadIds, setPinThreadIds] = useState<readonly string[]>(() =>
    row.pins.filter((pin) => pin.status !== "resolved").map((pin) => pin.threadId),
  );
  const [submitted, setSubmitted] = useState(false);

  const draft: ConsensusDecisionDraft = {
    assignmentId: row.assignmentId,
    lane: row.lane,
    value,
    reason,
    conditions: parseConsensusConditions(conditionsText),
    pinThreadIds,
  };
  const issues = validateConsensusDecision(draft);
  const blocking = issues.filter((issue) => issue.blocking);
  const reasonRequired = value === "request-changes" || value === "veto";

  const togglePin = (threadId: string, checked: boolean) => {
    setSubmitted(false);
    setPinThreadIds((current) =>
      checked ? [...new Set([...current, threadId])] : current.filter((id) => id !== threadId),
    );
  };

  const submit = () => {
    const result = buildConsensusDecisionSubmission(draft);
    if (!result.ok) return;
    void Promise.resolve(onRegisterDecision(result.submission)).then(() => {
      setSubmitted(true);
      setReason("");
      setConditionsText("");
    });
  };

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-xs font-bold text-fg-2">
        {row.decision
          ? bt("내 판정 다시 등록하기", "Register my verdict again")
          : bt("내 판정 등록하기", "Register my verdict")}
      </p>
      <fieldset className="mt-2">
        <legend className="sr-only">{bt("판정", "Verdict")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {CONSENSUS_REGISTERABLE_DECISIONS.map((candidate) => (
            <label
              key={candidate}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-[0.7rem]",
                value === candidate
                  ? "border-accent bg-accent-soft font-bold text-fg"
                  : "border-line bg-card text-fg-2",
              )}
            >
              <input
                type="radio"
                name={`consensus-decision-${row.assignmentId}`}
                value={candidate}
                checked={value === candidate}
                onChange={() => {
                  setValue(candidate);
                  setSubmitted(false);
                }}
                className="sr-only"
              />
              {bt(REVIEW_DECISION_LABELS[candidate].ko, REVIEW_DECISION_LABELS[candidate].en)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-2.5 block text-xs text-fg-3">
        {reasonRequired ? bt("사유 (필수)", "Reason (required)") : bt("사유 (선택)", "Reason (optional)")}
        <textarea
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setSubmitted(false);
          }}
          rows={2}
          placeholder={bt("왜 이렇게 판정했는지 적어 주세요.", "Say why you decided this.")}
          className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg"
        />
      </label>

      {value === "approve-with-conditions" ? (
        <label className="mt-2 block text-xs text-fg-3">
          {bt("조건 (한 줄에 하나씩, 필수)", "Conditions (one per line, required)")}
          <textarea
            value={conditionsText}
            onChange={(event) => {
              setConditionsText(event.target.value);
              setSubmitted(false);
            }}
            rows={2}
            placeholder={bt("충족해야 할 조건을 한 줄에 하나씩 적어 주세요.", "One condition per line.")}
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg"
          />
        </label>
      ) : null}

      {row.pins.length > 0 ? (
        <fieldset className="mt-2.5">
          <legend className="text-xs text-fg-3">{bt("근거로 붙일 내 핀", "My pins to attach as evidence")}</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {row.pins.map((pin) => (
              <label
                key={pin.threadId}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] text-fg-2"
              >
                <input
                  type="checkbox"
                  checked={pinThreadIds.includes(pin.threadId)}
                  onChange={(event) => togglePin(pin.threadId, event.target.checked)}
                />
                {bt(`핀 ${pin.number}`, `Pin ${pin.number}`)}
                {pin.status === "resolved" ? bt(" · 해결", " · resolved") : ""}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mt-2 text-xs text-fg-3">
          {bt(
            "아직 단 핀이 없어요. 고칠 곳은 비교 검수에서 핀으로 찍어 두면 여기에 근거로 붙일 수 있어요.",
            "No pins yet. Pin spots in compare review and you can attach them here as evidence.",
          )}
        </p>
      )}

      {issues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {issues.map((issue) => (
            <li key={issue.code} className={issue.blocking ? "text-xs font-bold text-fg" : "text-xs text-fg-3"}>
              {bt(issue.message.ko, issue.message.en)}
            </li>
          ))}
        </ul>
      ) : null}
      {registerError ? <p className="mt-2 text-xs font-bold text-fg">{registerError}</p> : null}
      {submitted ? (
        <p className="mt-2 text-xs text-fg-2">{bt("판정을 등록했어요.", "Verdict registered.")}</p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={blocking.length > 0 || registering}
        className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}
      >
        {registering ? bt("등록 중…", "Registering…") : bt("판정 등록", "Register verdict")}
      </button>
      {row.decision ? (
        <p className="mt-1.5 text-xs text-fg-3">
          {bt("이미 판정이 있어도 다시 등록하면 최신 판정으로 갱신돼요.", "Registering again replaces your verdict with the latest one.")}
        </p>
      ) : null}
    </div>
  );
}

function ReviewerRow({
  row,
  onSelectPin,
  registering,
  registerError,
  onRegisterDecision,
}: {
  readonly row: ReviewerConsensusRow;
  readonly onSelectPin?: (pin: ConsensusPinRef) => void;
  readonly registering?: boolean;
  readonly registerError?: string | null;
  readonly onRegisterDecision?: (submission: ConsensusDecisionSubmission) => void | Promise<void>;
}) {
  const bt = useBilingual("MultiReviewerConsensusPanel");
  return (
    <li className="rounded-2xl border border-line bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-fg">{row.displayName}</p>
        <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] text-fg-3">
          {bt(row.laneLabel.ko, row.laneLabel.en)}
        </span>
        {row.required ? (
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] font-bold text-fg-2">
            {bt("필수 검수자", "Required")}
          </span>
        ) : null}
        <span className="ml-auto">
          {row.decisionLabel && row.decision ? (
            <span
              data-tone={reviewDecisionTone(row.decision)}
              className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-[0.7rem] font-bold text-fg"
            >
              {bt(row.decisionLabel.ko, row.decisionLabel.en)}
            </span>
          ) : (
            <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] text-fg-3">
              {bt("판정 대기", "Awaiting verdict")}
            </span>
          )}
        </span>
      </div>

      {row.decision === "approve-with-conditions" && row.conditions.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-fg">
          {row.conditions.map((condition) => (
            <li key={condition}>{condition}</li>
          ))}
        </ul>
      ) : null}
      {row.reasonCode ? (
        <p className="mt-1.5 text-xs text-fg-3">
          {bt(`사유 코드 ${row.reasonCode}`, `Reason code ${row.reasonCode}`)}
        </p>
      ) : null}

      <div className="mt-2.5">
        <PinChips row={row} onSelectPin={onSelectPin} />
      </div>

      {onRegisterDecision ? (
        <ConsensusDecisionForm
          row={row}
          registering={registering}
          registerError={registerError}
          onRegisterDecision={onRegisterDecision}
        />
      ) : null}
    </li>
  );
}

export interface MultiReviewerConsensusPanelProps {
  readonly summary: ReviewerConsensusSummary | null;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  /** 비교 검수 화면으로 가는 경로. 있으면 상단에 진입 버튼을 단다. */
  readonly compareHref?: string;
  /** 핀 칩을 눌렀을 때 비교 화면의 그 핀으로 이동시키는 콜백. */
  readonly onSelectPin?: (pin: ConsensusPinRef) => void;
  /**
   * 로그인한 검수자 본인의 배정 ID. onRegisterDecision과 함께 있을 때만
   * 그 검수자의 행에 판정 입력 폼이 붙는다 — 남의 행에는 폼이 붙지 않아
   * 다른 사람 이름으로 판정을 등록할 수 없다.
   */
  readonly currentAssignmentId?: string | null;
  /** 판정 제출 콜백. 호스트가 코어 판정으로 바꿔 aggregate에 append 한다. */
  readonly onRegisterDecision?: (submission: ConsensusDecisionSubmission) => void | Promise<void>;
  /** 등록 진행 중 표시. 제출 버튼을 잠그고 "등록 중…"으로 바꾼다. */
  readonly registering?: boolean;
  /** 등록 실패 사유. 내 행 폼 아래에 그대로 보여 준다. */
  readonly registerError?: string | null;
}

export function MultiReviewerConsensusPanel({
  summary,
  loading,
  error,
  onRetry,
  compareHref,
  onSelectPin,
  currentAssignmentId,
  onRegisterDecision,
  registering,
  registerError,
}: MultiReviewerConsensusPanelProps) {
  const bt = useBilingual("MultiReviewerConsensusPanel");

  if (loading) {
    return (
      <section aria-label={bt("집단 검수 합의", "Group review consensus")} className="rounded-2xl border border-line bg-card p-4">
        <div className="h-4 w-36 animate-pulse rounded bg-panel" />
        <div className="mt-3 space-y-2">
          <div className="h-20 animate-pulse rounded-xl bg-panel" />
          <div className="h-20 animate-pulse rounded-xl bg-panel" />
        </div>
        <p className="mt-3 text-xs text-fg-3">{bt("검수 판정을 모으고 있어요.", "Collecting reviewer verdicts.")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label={bt("집단 검수 합의", "Group review consensus")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-bold text-fg">{bt("합의 상태를 불러오지 못했어요.", "Couldn't load the consensus state.")}</p>
        <p className="mt-1 text-sm leading-6 text-fg-2">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}>
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
      </section>
    );
  }

  if (!summary || summary.state === "no-reviewers") {
    return (
      <section aria-label={bt("집단 검수 합의", "Group review consensus")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-black text-fg">{bt("집단 검수 합의", "Group review consensus")}</p>
        <p className="mt-1.5 text-sm leading-6 text-fg-2">
          {bt(
            "아직 이 회차에 검수자가 지정되지 않았어요. 검수 정책에서 레인별 검수자를 지정하면, 각자의 판정과 핀이 여기에 한눈에 모여요.",
            "No reviewers are assigned to this episode yet. Assign lane reviewers in the review policy, and every verdict and pin gathers here.",
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

  return (
    <section aria-label={bt("집단 검수 합의", "Group review consensus")} className="rounded-2xl border border-line bg-card p-4">
      <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border p-3", STATE_BANNER_CLASS[summary.state])}>
        <p className="text-sm font-black text-fg">{bt(summary.stateLabel.ko, summary.stateLabel.en)}</p>
        <span className="text-xs text-fg-3">
          {bt(
            `승인 ${summary.counts.approved} · 조건부 ${summary.counts.conditional} · 수정 요청 ${summary.counts.changesRequested} · 거부 ${summary.counts.vetoed} · 대기 ${summary.counts.awaiting}`,
            `Approved ${summary.counts.approved} · Conditional ${summary.counts.conditional} · Changes ${summary.counts.changesRequested} · Veto ${summary.counts.vetoed} · Waiting ${summary.counts.awaiting}`,
          )}
        </span>
        {compareHref ? (
          <Link to={compareHref} className={buttonClass({ size: "sm", className: "ml-auto min-h-11" })}>
            {bt("비교 검수에서 보기", "Open in compare review")}
          </Link>
        ) : null}
      </div>

      {summary.blockingReasons.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {summary.blockingReasons.map((reason) => (
            <li key={reason.ko} className="text-sm leading-6 text-fg-2">
              {bt(reason.ko, reason.en)}
            </li>
          ))}
        </ul>
      ) : null}

      {summary.pins.total > 0 ? (
        <p className="mt-3 text-xs text-fg-3">
          {bt(
            `검수 핀 ${summary.pins.total}개 중 미해결 ${summary.pins.open}개 · 긴급 ${summary.pins.urgent}개`,
            `${summary.pins.open} of ${summary.pins.total} review pins open · ${summary.pins.urgent} urgent`,
          )}
        </p>
      ) : null}

      <ul className="mt-3 space-y-2.5">
        {summary.rows.map((row) => (
          <ReviewerRow
            key={row.assignmentId}
            row={row}
            onSelectPin={onSelectPin}
            registering={registering}
            registerError={registerError}
            onRegisterDecision={
              onRegisterDecision && currentAssignmentId && row.assignmentId === currentAssignmentId
                ? onRegisterDecision
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}
