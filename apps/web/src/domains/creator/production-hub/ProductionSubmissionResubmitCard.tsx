import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileDiff,
  RefreshCcw,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { useState } from "react";

import type { ClarificationThread, CutPlan, Submission } from "@toonstudio/core/production";

import { reviewLaneLabel } from "./production-labels";
import type { DerivedSubmissionResubmissionSummary } from "./production-submission-resubmit-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export function ProductionSubmissionResubmitComposer({
  submission,
  cuts,
  selectedCutId,
  openClarifications,
  priorApprovalSummary,
  nextReviewerLabels,
  canEdit,
  pending,
  noteValue,
  onNoteChange,
  onResubmit,
}: {
  readonly submission: Submission;
  readonly cuts: readonly CutPlan[];
  readonly selectedCutId: string | null;
  readonly openClarifications: readonly ClarificationThread[];
  readonly priorApprovalSummary: readonly string[];
  readonly nextReviewerLabels: readonly string[];
  readonly canEdit: boolean;
  readonly pending: boolean;
  readonly noteValue?: string;
  readonly onNoteChange?: (next: string) => void;
  readonly onResubmit: (input: {
    readonly changedCutIds: readonly string[];
    readonly resolveClarificationIds: readonly string[];
    readonly note: string;
  }) => void;
}) {
  const bt = useBilingual("ProductionSubmissionResubmitComposer");
  const initialCut = selectedCutId && cuts.some((cut) => cut.cutId === selectedCutId)
    ? selectedCutId
    : cuts[0]?.cutId ?? "";
  const [changedCutIds, setChangedCutIds] = useState<readonly string[]>(() =>
    initialCut ? [initialCut] : [],
  );
  const [resolveIds, setResolveIds] = useState<readonly string[]>(() =>
    openClarifications.slice(0, 1).map((item) => item.id),
  );
  const [internalNote, setInternalNote] = useState("");
  const note = noteValue ?? internalNote;
  const setNote = (next: string) => {
    setInternalNote(next);
    onNoteChange?.(next);
  };

  const toggleCut = (cutId: string) => {
    setChangedCutIds((current) =>
      current.includes(cutId) ? current.filter((id) => id !== cutId) : [...current, cutId],
    );
  };

  const toggleResolve = (threadId: string) => {
    setResolveIds((current) =>
      current.includes(threadId) ? current.filter((id) => id !== threadId) : [...current, threadId],
    );
  };

  const nextRevNumber = submission.revisionRef.revision + 1;

  return (
    <section
      data-review-resubmit-composer="true"
      aria-label={bt("수정 요청 반영 및 새 리비전 재제출", "Address change requests and resubmit new revision")}
      className="mt-3 rounded-2xl border border-accent/45 bg-accent-soft/45 p-3.5 text-xs text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-black text-fg">
          <RefreshCcw className="size-4 text-accent" aria-hidden="true" />
          {bt(
            `${submission.revisionRef.revision}차 수정 요청 반영 → ${nextRevNumber}차 새 제출본 재제출`,
            `Address rev. ${submission.revisionRef.revision} changes → resubmit rev. ${nextRevNumber}`,
          )}
        </p>
        <span className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-[0.6875rem] font-bold text-warn">
          {bt("새 리비전은 0승인부터 재검수", "New revision resets approvals to 0")}
        </span>
      </div>

      {priorApprovalSummary.length > 0 ? (
        <p className="mt-2 rounded-xl border border-warn/35 bg-card/85 px-3 py-2 text-[0.6875rem] leading-5 text-fg-2">
          <strong className="text-fg">
            {bt("기존 승인 승계 안 함:", "Prior approvals not carried over:")}
          </strong>{" "}
          {bt(
            `이전 ${submission.revisionRef.revision}차에서 기록된 승인(${priorApprovalSummary.join(", ")})은 ${submission.revisionRef.revision}차 보관 이력으로만 남고, ${nextRevNumber}차 승인으로 표시되지 않습니다.`,
            `Approvals recorded on rev. ${submission.revisionRef.revision} (${priorApprovalSummary.join(", ")}) stay archived on rev. ${submission.revisionRef.revision} and never count as rev. ${nextRevNumber} approvals.`,
          )}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-3">
          <p className="font-bold text-fg">
            {bt("① 이번에 수정·변경한 컷 선택 (필수)", "1. Select modified cuts (required)")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={bt("변경된 컷 선택", "Select changed cuts")}>
            {cuts.map((cut) => {
              const checked = changedCutIds.includes(cut.cutId);
              return (
                <button
                  key={cut.cutId}
                  type="button"
                  data-resubmit-cut-toggle={cut.cutId}
                  aria-pressed={checked}
                  disabled={!canEdit || pending}
                  onClick={() => toggleCut(cut.cutId)}
                  className={cn(
                    "min-h-8 rounded-lg border px-2.5 text-xs font-bold transition-colors",
                    checked
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:text-fg",
                  )}
                >
                  {cut.cutId} {checked ? bt("· 변경됨", "· Changed") : bt("· 유지", "· Unchanged")}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <p className="font-bold text-fg">
            {bt("② 열린 검수 질문·요청 해결 여부 표시", "2. Mark open questions resolved or keep open")}
          </p>
          {openClarifications.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {openClarifications.map((thread) => {
                const resolved = resolveIds.includes(thread.id);
                return (
                  <li key={thread.id} className="flex items-start justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
                    <span className="min-w-0 text-[0.6875rem] leading-4 text-fg-2">
                      <strong className="text-fg">[{thread.scope.id}]</strong> {thread.question}
                    </span>
                    <button
                      type="button"
                      data-resubmit-resolve-toggle={thread.id}
                      aria-pressed={resolved}
                      disabled={!canEdit || pending}
                      onClick={() => toggleResolve(thread.id)}
                      className={cn(
                        "shrink-0 rounded-md border px-2 py-1 text-[0.65rem] font-bold",
                        resolved
                          ? "border-good/45 bg-good/15 text-good"
                          : "border-warn/45 bg-warn/15 text-warn",
                      )}
                    >
                      {resolved ? bt("해결 반영", "Resolved") : bt("미해결 유지", "Still open")}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[0.6875rem] text-fg-3">
              {bt("추가 인계 질문 없이 검수 수정 요청을 반영해 재제출합니다.", "Resubmit after addressing the review change request.")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={note}
          disabled={!canEdit || pending}
          onChange={(event) => setNote(event.target.value)}
          aria-label={bt("재제출 수정 요약 메모", "Resubmission summary note")}
          placeholder={bt("예: cut-12-001 봉투 문양 가림 처리 및 여백 재조정 완료", "e.g. Masked envelope crest on cut-12-001 and adjusted pacing")}
          className="min-h-10 flex-1 rounded-xl border border-line bg-card px-3 text-xs text-fg placeholder:text-fg-3"
        />
        <button
          type="button"
          data-review-resubmit-btn="true"
          disabled={!canEdit || pending || changedCutIds.length === 0}
          onClick={() =>
            onResubmit({
              changedCutIds,
              resolveClarificationIds: resolveIds,
              note,
            })
          }
          className={buttonClass({ size: "sm", className: "min-h-10 shrink-0 gap-1.5 text-xs" })}
        >
          <RefreshCcw className="size-3.5" aria-hidden="true" />
          {bt(`${nextRevNumber}차 수정본 재제출`, `Resubmit rev. ${nextRevNumber}`)}
        </button>
      </div>

      {nextReviewerLabels.length > 0 ? (
        <p className="mt-2 text-[0.6875rem] text-fg-2">
          <strong className="text-fg">{bt("재제출 후 다음 검수 담당자:", "Next reviewers after resubmit:")}</strong>{" "}
          {nextReviewerLabels.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

export function ProductionSubmissionResubmissionSummaryBanner({
  submission,
  summary,
  onSelectCut,
}: {
  readonly submission: Submission;
  readonly summary: DerivedSubmissionResubmissionSummary;
  readonly onSelectCut: (cutId: string) => void;
}) {
  const bt = useBilingual("ProductionSubmissionResubmissionSummaryBanner");
  if (!summary.isResubmitted) return null;

  const pendingNextReviewers = summary.nextReviewers.filter((entry) => !entry.approvedInCurrentRevision);
  const currentApprovedReviewers = summary.nextReviewers.filter((entry) => entry.approvedInCurrentRevision);

  return (
    <section
      data-review-resubmission-summary="true"
      aria-label={bt("재제출 리비전 검수 요약", "Resubmitted revision review summary")}
      className="mt-3 space-y-2.5 rounded-2xl border border-accent/40 bg-card p-3.5 text-xs text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-black text-fg">
          <FileDiff className="size-4 text-accent" aria-hidden="true" />
          {bt(
            `${submission.revisionRef.revision}차 재제출 검수 브리핑 (이전 ${summary.previousRevisionNumber ?? submission.revisionRef.revision - 1}차 대체)`,
            `Rev. ${submission.revisionRef.revision} resubmission brief (supersedes rev. ${summary.previousRevisionNumber ?? submission.revisionRef.revision - 1})`,
          )}
        </p>
        <span
          data-resubmit-prior-approval-reset="true"
          className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-[0.6875rem] font-bold text-warn"
        >
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          {summary.priorApprovedReviewers.length > 0
            ? bt(
                `이전 ${summary.previousRevisionNumber}차 승인 ${summary.priorApprovedReviewers.length}건 미승계 · 새 리비전 별도 승인 필수`,
                `${summary.priorApprovedReviewers.length} prior rev. ${summary.previousRevisionNumber} approval(s) not carried over`,
              )
            : bt("이전 리비전 승인 없음 · 새 리비전 검수 진행 중", "Fresh revision approval required")}
        </span>
      </div>

      {summary.note ? (
        <p className="rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg-2">
          <strong className="text-fg">{bt("수정 요약:", "Revision note:")}</strong> {summary.note}
        </p>
      ) : null}

      {summary.priorApprovedReviewers.length > 0 ? (
        <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[0.6875rem] leading-5 text-fg">
          {bt(
            `주의: ${summary.priorApprovedReviewers.map((r) => `${r.displayName}(${reviewLaneLabel(r.lane, bt)})`).join(", ")}의 승인은 이전 ${summary.previousRevisionNumber}차 기록이며, 현재 ${submission.revisionRef.revision}차 제출본 승인으로 표시되지 않습니다.`,
            `Note: Approvals from ${summary.priorApprovedReviewers.map((r) => `${r.displayName} (${reviewLaneLabel(r.lane, bt)})`).join(", ")} belong to rev. ${summary.previousRevisionNumber} and are not counted as rev. ${submission.revisionRef.revision} approvals.`,
          )}
        </p>
      ) : null}

      <div className="grid gap-2.5 lg:grid-cols-3">
        {/* 1. 변경된 컷 vs 변경 없는 컷 */}
        <div className="rounded-xl border border-line bg-panel p-2.5" data-resubmit-changed-cuts={summary.changedCutIds.join(",")}>
          <p className="font-bold text-fg">
            {bt(
              `변경된 컷 (${summary.changedCutIds.length}개) · 유지 (${summary.unchangedCutIds.length}개)`,
              `Changed cuts (${summary.changedCutIds.length}) · Unchanged (${summary.unchangedCutIds.length})`,
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {summary.changedCutIds.map((cutId) => (
              <button
                key={cutId}
                type="button"
                data-resubmit-jump-cut={cutId}
                onClick={() => onSelectCut(cutId)}
                className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-accent/45 bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-bold text-accent hover:bg-accent hover:text-on-accent"
              >
                {cutId} · {bt("변경됨", "Changed")}
                <ArrowRight className="size-3" aria-hidden="true" />
              </button>
            ))}
            {summary.unchangedCutIds.map((cutId) => (
              <span
                key={cutId}
                className="inline-flex min-h-7 items-center rounded-lg border border-line bg-card px-2 py-0.5 text-[0.6875rem] text-fg-3"
              >
                {cutId} · {bt("변경 없음", "Unchanged")}
              </span>
            ))}
          </div>
        </div>

        {/* 2. 해결 요청 vs 미해결 요청 */}
        <div
          className="rounded-xl border border-line bg-panel p-2.5"
          data-resubmit-resolved-count={summary.resolvedRequests.length}
          data-resubmit-open-count={summary.openRequests.length}
        >
          <p className="font-bold text-fg">
            {bt(
              `요청 처리 구분: 해결 ${summary.resolvedRequests.length}건 · 미해결 ${summary.openRequests.length}건`,
              `Requests: ${summary.resolvedRequests.length} resolved · ${summary.openRequests.length} open`,
            )}
          </p>
          <ul className="mt-1.5 space-y-1 text-[0.6875rem]">
            {summary.resolvedRequests.slice(0, 3).map((req) => (
              <li key={req.id} className="flex items-center gap-1.5 text-good">
                <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  [{bt("해결", "Resolved")} · {req.scopeLabel}] {req.summary}
                </span>
              </li>
            ))}
            {summary.openRequests.slice(0, 3).map((req) => (
              <li key={req.id} className="flex items-center gap-1.5 text-warn">
                <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  [{bt("미해결", "Open")} · {req.scopeLabel}] {req.summary}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* 3. 다음 검수 담당자 */}
        <div
          className="rounded-xl border border-line bg-panel p-2.5"
          data-resubmit-next-reviewers={pendingNextReviewers.map((r) => r.assignmentId).join(",")}
        >
          <p className="flex items-center gap-1 font-bold text-fg">
            <UserCheck className="size-3.5 text-accent" aria-hidden="true" />
            {bt(
              `다음 검수 담당자 (${pendingNextReviewers.length}명 대기)`,
              `Next reviewers (${pendingNextReviewers.length} awaiting)`,
            )}
          </p>
          <ul className="mt-1.5 space-y-1 text-[0.6875rem]">
            {pendingNextReviewers.map((reviewer) => (
              <li key={`${reviewer.lane}:${reviewer.assignmentId}`} className="flex items-center justify-between gap-2 text-fg-2">
                <span className="font-semibold text-fg">{reviewer.displayName} · {reviewer.roleLabel}</span>
                <span className="rounded-full border border-warn/35 bg-warn/10 px-2 py-0.5 text-[0.625rem] font-bold text-warn">
                  {reviewLaneLabel(reviewer.lane, bt)} {bt("검수 대기", "Awaiting")}
                </span>
              </li>
            ))}
            {currentApprovedReviewers.map((reviewer) => (
              <li key={`ok-${reviewer.lane}:${reviewer.assignmentId}`} className="flex items-center justify-between gap-2 text-good">
                <span className="font-semibold">{reviewer.displayName} · {reviewer.roleLabel}</span>
                <span className="rounded-full border border-good/35 bg-good/10 px-2 py-0.5 text-[0.625rem] font-bold">
                  {reviewLaneLabel(reviewer.lane, bt)} {bt("이번 리비전 승인", "Approved")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
