import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  FileDiff,
  Link2,
  RefreshCcw,
  ShieldAlert,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  SYNTHETIC_STUDIO_REVIEW_CUTS,
  type StudioReviewSession,
} from "../studio-review-workflow";
import { ProductionRoleTransitionBanner } from "./ProductionReviewDeepLinkBanners";
import type { PreservedDraftEntry, RoleTransitionSummary } from "./production-role-transition-model";

const REVIEWER_DISPLAY_LABELS: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = {
  "demo-reviewer-pd": { ko: "현우 PD · 담당 편집 (@hyunwoo.pd)", en: "Hyunwoo PD · Editor (@hyunwoo.pd)" },
  "project-owner": { ko: "지훈 · 총괄 작가", en: "Jihoon · Lead Creator" },
};

function reviewerLabel(id: string, bt: (ko: string, en: string) => string): string {
  const entry = REVIEWER_DISPLAY_LABELS[id];
  return entry ? bt(entry.ko, entry.en) : id;
}

export function ProductionCollabHubInviteCard({
  unifiedInviteUrl,
  inviteCopied,
  inviteHandle,
  invitedMembers,
  onCopyInvite,
  onChangeHandle,
  onSendInvite,
}: {
  readonly unifiedInviteUrl: string;
  readonly inviteCopied: boolean;
  readonly inviteHandle: string;
  readonly invitedMembers: readonly { readonly id: string; readonly handle: string; readonly roleKo: string; readonly roleEn: string }[];
  readonly onCopyInvite: () => void;
  readonly onChangeHandle: (next: string) => void;
  readonly onSendInvite: () => void;
}) {
  const bt = useBilingual("ProductionCollabHubInviteCard");
  return (
    <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-5" data-testid="collab-pillar-1-invite">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Link2 size={16} className="text-accent" aria-hidden="true" />
          {bt("① 통합 초대 (팀 + 원고 동시 연결)", "1. Unified Invite (Team + Manuscript)")}
        </h3>
        <Link to="/team/people" className="inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:underline">
          {bt("팀원 관리 ↗", "Manage team ↗")}
        </Link>
      </div>
      <p className="mt-1 text-xs text-fg-2">
        {bt("팀 합류와 현재 회차 원고 접근 권한을 링크 하나로 동시에 부여합니다.", "Connect team membership and current episode access with a single link.")}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          readOnly
          aria-label={bt("팀과 원고 통합 초대 링크", "Unified team and manuscript invite URL")}
          value={unifiedInviteUrl}
          className="min-h-11 flex-1 rounded-xl border border-line bg-panel px-3 text-xs text-fg-2"
        />
        <button
          type="button"
          data-testid="collab-hub-copy-invite"
          onClick={onCopyInvite}
          className={buttonClass({ size: "sm", className: "min-h-11 shrink-0 gap-1.5 text-xs" })}
        >
          {inviteCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {inviteCopied ? bt("링크 복사됨", "Copied") : bt("1클릭 링크 복사", "Copy invite link")}
        </button>
      </div>
      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={inviteHandle}
          onChange={(event) => onChangeHandle(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSendInvite();
            }
          }}
          aria-label={bt("초대할 협업자 이메일 또는 아이디", "Collaborator email or handle")}
          placeholder={bt("@아이디 또는 이메일로 직무 지정 초대", "Invite by @handle or email")}
          className="min-h-11 flex-1 rounded-xl border border-line bg-panel px-3 text-xs text-fg placeholder:text-fg-3"
        />
        <button
          type="button"
          data-testid="collab-hub-send-invite"
          onClick={onSendInvite}
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 shrink-0 gap-1.5 text-xs" })}
        >
          <UserPlus size={14} aria-hidden="true" />
          {bt("초대 발송", "Invite")}
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={bt("참여 중인 협업 멤버", "Active collaborators")}>
        {invitedMembers.map((member) => (
          <li key={member.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1 text-[0.68rem] text-fg-2">
            <strong className="font-bold text-fg">{member.handle}</strong>
            <span>· {bt(member.roleKo, member.roleEn)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export interface CollabHubStaleMutationNotice {
  readonly staleVersionId: string;
  readonly latestVersionId: string;
  readonly actionKind: "approved" | "changes-requested" | "comment";
}

export function ProductionCollabHubStageAndResubmitBar({
  viewedSession,
  selectedCutId,
  isHistoricalView,
  canDecide,
  canEditManuscript,
  resubmitNote,
  onChangeResubmitNote,
  roleTransition = null,
  preservedDraftEntries = [],
  onDismissRoleTransition,
  concurrentNewerVersionId = null,
  staleMutationNotice = null,
  onSwitchToConcurrentLatest,
  onDismissStaleNotice,
  onRequestRevisionStage,
  onApproveStage,
  onSelectCut,
  onResubmitRevision,
}: {
  readonly viewedSession: StudioReviewSession;
  readonly selectedCutId: string;
  readonly isHistoricalView: boolean;
  readonly canDecide: boolean;
  readonly canEditManuscript: boolean;
  readonly resubmitNote?: string;
  readonly onChangeResubmitNote?: (next: string) => void;
  readonly roleTransition?: RoleTransitionSummary | null;
  readonly preservedDraftEntries?: readonly PreservedDraftEntry[];
  readonly onDismissRoleTransition?: () => void;
  readonly concurrentNewerVersionId?: string | null;
  readonly staleMutationNotice?: CollabHubStaleMutationNotice | null;
  readonly onSwitchToConcurrentLatest?: () => void;
  readonly onDismissStaleNotice?: () => void;
  readonly onRequestRevisionStage: () => void;
  readonly onApproveStage: () => void;
  readonly onSelectCut: (cutId: string) => void;
  readonly onResubmitRevision: (input: {
    readonly changedCutIds: readonly string[];
    readonly resolveThreadIds: readonly string[];
    readonly note: string;
  }) => void;
}) {
  const bt = useBilingual("ProductionCollabHubStageAndResubmitBar");
  const hubCuts = SYNTHETIC_STUDIO_REVIEW_CUTS.slice(0, 3);
  const [changedCutIds, setChangedCutIds] = useState<readonly string[]>(() => [selectedCutId || "cut-01"]);
  const [internalNote, setInternalNote] = useState("");
  const note = resubmitNote ?? internalNote;
  const setNote = (next: string) => {
    setInternalNote(next);
    onChangeResubmitNote?.(next);
  };

  const toggleCut = (cutId: string) => {
    setChangedCutIds((current) =>
      current.includes(cutId) ? current.filter((id) => id !== cutId) : [...current, cutId],
    );
  };

  const currentApprovedCount = viewedSession.decisions.filter((d) => d.decision === "approved").length;
  const requiredCount = viewedSession.requiredReviewerIds.length || 1;
  const openThreads = viewedSession.threads.filter((t) => t.status === "open");
  const resolvedThreads = viewedSession.threads.filter((t) => t.status === "resolved");
  const canShowResubmitComposer = !isHistoricalView && viewedSession.status === "changes-requested";
  const meta = viewedSession.resubmissionMeta ?? null;

  return (
    <div className="mt-3 space-y-2.5">
      {roleTransition ? (
        <ProductionRoleTransitionBanner
          transition={roleTransition}
          preservedEntries={preservedDraftEntries}
          onDismiss={onDismissRoleTransition}
          testId="collab-hub-role-transition-banner"
          copyTestId="collab-hub-copy-preserved-draft"
          className="mt-0"
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
          <span className={cn("rounded-full px-2.5 py-0.5", viewedSession.status === "in-review" ? "bg-warning-soft/30 text-warning" : "text-fg-3")}>
            {bt("① 검수 요청", "1. In Review")}
          </span>
          <span aria-hidden="true" className="text-fg-3">→</span>
          <span className={cn("rounded-full px-2.5 py-0.5", viewedSession.status === "changes-requested" ? "bg-accent-soft text-accent" : "text-fg-3")}>
            {bt("② 수정 중", "2. Revising")}
          </span>
          <span aria-hidden="true" className="text-fg-3">→</span>
          <span className={cn("rounded-full px-2.5 py-0.5", viewedSession.status === "approved" ? "bg-success-soft/30 text-success" : "text-fg-3")}>
            {bt("③ 승인 완료", "3. Approved")}
          </span>
          <span
            data-testid="collab-hub-approval-tally"
            className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.68rem] tabular-nums text-fg-2"
          >
            {bt(`현재 리비전 승인 ${currentApprovedCount}/${requiredCount}`, `Current rev approvals ${currentApprovedCount}/${requiredCount}`)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canDecide}
            onClick={onRequestRevisionStage}
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 px-3 text-xs" })}
          >
            {bt("수정 요청", "Request changes")}
          </button>
          <button
            type="button"
            data-testid="collab-hub-approve-btn"
            disabled={!canDecide}
            onClick={onApproveStage}
            className={buttonClass({ size: "sm", className: "min-h-11 px-3 text-xs" })}
          >
            {bt("검수 최종 승인", "Approve")}
          </button>
        </div>
      </div>

      {concurrentNewerVersionId && concurrentNewerVersionId !== viewedSession.versionId ? (
        <div
          role="status"
          data-testid="collab-hub-concurrent-newer-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/45 bg-warning-soft/20 px-3 py-2 text-xs text-fg"
        >
          <span className="font-bold text-warning">
            {bt(
              `다른 참여자가 더 최신 리비전(${concurrentNewerVersionId})을 제출했습니다. 현재 열람본(${viewedSession.versionId})은 구버전이므로 최신 상태를 덮지 않습니다.`,
              `Another collaborator submitted a newer revision (${concurrentNewerVersionId}). Current view (${viewedSession.versionId}) is older and will not overwrite the latest state.`,
            )}
          </span>
          {onSwitchToConcurrentLatest ? (
            <button
              type="button"
              data-testid="collab-hub-switch-concurrent-latest"
              onClick={onSwitchToConcurrentLatest}
              className={buttonClass({ size: "sm", className: "min-h-8 px-2.5 text-[0.7rem]" })}
            >
              {bt(`최신본(${concurrentNewerVersionId}) 열기`, `Open latest (${concurrentNewerVersionId})`)}
            </button>
          ) : null}
        </div>
      ) : null}

      {staleMutationNotice ? (
        <div
          role="alert"
          data-testid="collab-hub-stale-revision-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/50 bg-warning-soft/25 p-3 text-xs text-fg"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex items-center gap-1.5 font-black text-warning">
              <ShieldAlert size={14} aria-hidden="true" />
              {staleMutationNotice.actionKind === "approved"
                ? bt(
                    `구버전(${staleMutationNotice.staleVersionId}) 승인 기록됨 · 최신본(${staleMutationNotice.latestVersionId}) 승인으로 반영되지 않음`,
                    `Recorded as older revision (${staleMutationNotice.staleVersionId}) approval · NOT counted on latest (${staleMutationNotice.latestVersionId})`,
                  )
                : bt(
                    `구버전(${staleMutationNotice.staleVersionId}) 응답 감지 · 최신본(${staleMutationNotice.latestVersionId}) 상태를 덮지 않고 보호함`,
                    `Late response on older revision (${staleMutationNotice.staleVersionId}) · latest (${staleMutationNotice.latestVersionId}) state preserved`,
                  )}
            </p>
            <p className="text-[0.7rem] leading-5 text-fg-2">
              {bt(
                `뒤늦게 도착한 ${staleMutationNotice.staleVersionId} 변경은 이전 리비전 보관 이력에만 남겼으며, 현재 최신본(${staleMutationNotice.latestVersionId})의 검수 상태와 승인 집계(${currentApprovedCount}/${requiredCount})는 덮어쓰지 않았습니다.`,
                `The late update for ${staleMutationNotice.staleVersionId} stayed on the archived revision only; latest (${staleMutationNotice.latestVersionId}) status and approvals (${currentApprovedCount}/${requiredCount}) were preserved.`,
              )}
            </p>
          </div>
          {onDismissStaleNotice ? (
            <button
              type="button"
              onClick={onDismissStaleNotice}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-8 px-2.5 text-[0.7rem]" })}
            >
              {bt("확인", "Dismiss")}
            </button>
          ) : null}
        </div>
      ) : null}

      {canShowResubmitComposer ? (
        <div
          data-testid="collab-hub-resubmit-composer"
          className="rounded-xl border border-accent/40 bg-accent-soft/35 p-3 text-xs text-fg"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="flex items-center gap-1.5 font-black text-fg">
              <RefreshCcw size={14} className="text-accent" aria-hidden="true" />
              {bt("수정 요청 반영 후 새 리비전 재제출", "Resubmit new revision after changes")}
            </strong>
            <span className="text-[0.68rem] font-semibold text-fg-2">
              {bt(
                `해결 ${resolvedThreads.length}건 · 미해결 ${openThreads.length}건`,
                `${resolvedThreads.length} resolved · ${openThreads.length} open`,
              )}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[0.68rem] font-bold text-fg-2">{bt("변경된 컷:", "Changed cuts:")}</span>
            {hubCuts.map((cut) => {
              const checked = changedCutIds.includes(cut.cutId);
              return (
                <button
                  key={cut.cutId}
                  type="button"
                  data-testid={`collab-hub-resubmit-cut-${cut.cutId}`}
                  aria-pressed={checked}
                  disabled={!canEditManuscript}
                  onClick={() => toggleCut(cut.cutId)}
                  className={cn(
                    "min-h-7 rounded-lg border px-2 text-[0.68rem] font-bold",
                    checked ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2",
                  )}
                >
                  {cut.cutId} {checked ? bt("· 변경됨", "· Changed") : bt("· 유지", "· Unchanged")}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={note}
              disabled={!canEditManuscript}
              onChange={(event) => setNote(event.currentTarget.value)}
              aria-label={bt("협업 허브 재제출 메모", "Collab hub resubmission note")}
              placeholder={bt("변경 내용 요약 (예: cut-01 가로등 역광 대비 보강 완료)", "Revision summary (e.g. boosted cut-01 rim light)")}
              className="min-h-9 flex-1 rounded-xl border border-line bg-card px-2.5 text-xs text-fg placeholder:text-fg-3 disabled:opacity-50"
            />
            <button
              type="button"
              data-testid="collab-hub-resubmit-btn"
              disabled={!canEditManuscript || changedCutIds.length === 0}
              onClick={() => {
                onResubmitRevision({
                  changedCutIds,
                  resolveThreadIds: [],
                  note,
                });
                setNote("");
              }}
              className={buttonClass({ size: "sm", className: "min-h-9 shrink-0 gap-1.5 text-xs" })}
            >
              <RefreshCcw size={13} aria-hidden="true" />
              {bt("새 리비전 재제출", "Resubmit revision")}
            </button>
          </div>
        </div>
      ) : null}

      {meta ? (
        <div
          data-testid="collab-hub-resubmission-summary"
          className="space-y-2 rounded-xl border border-accent/40 bg-card p-3 text-xs text-fg"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="flex items-center gap-1.5 font-black text-fg">
              <FileDiff size={14} className="text-accent" aria-hidden="true" />
              {bt(
                `${viewedSession.versionId} 재제출 브리핑 (이전 ${meta.previousVersionId} 대체)`,
                `${viewedSession.versionId} resubmission brief (from ${meta.previousVersionId})`,
              )}
            </strong>
            <span
              data-testid="collab-hub-prior-approval-reset"
              className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-soft/20 px-2 py-0.5 text-[0.65rem] font-bold text-warning"
            >
              <ShieldAlert size={12} aria-hidden="true" />
              {meta.previousApprovedReviewerIds.length > 0
                ? bt(
                    `이전 승인 ${meta.previousApprovedReviewerIds.length}건 미승계 (현재 승인 ${currentApprovedCount}/${requiredCount})`,
                    `${meta.previousApprovedReviewerIds.length} prior approval(s) reset (${currentApprovedCount}/${requiredCount})`,
                  )
                : bt(
                    `기존 승인 없음 · 새 리비전 승인 ${currentApprovedCount}/${requiredCount}`,
                    `Fresh revision approvals ${currentApprovedCount}/${requiredCount}`,
                  )}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-panel p-2">
              <p className="text-[0.68rem] font-bold text-fg">{bt("변경된 컷", "Changed cuts")}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {meta.changedCutIds.map((cutId) => (
                  <button
                    key={cutId}
                    type="button"
                    onClick={() => onSelectCut(cutId)}
                    className="rounded-md border border-accent/45 bg-accent-soft px-2 py-0.5 text-[0.65rem] font-bold text-accent"
                  >
                    {cutId} · {bt("변경됨", "Changed")}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel p-2">
              <p className="text-[0.68rem] font-bold text-fg">
                {bt(
                  `해결 ${resolvedThreads.length}건 · 미해결 ${openThreads.length}건`,
                  `${resolvedThreads.length} resolved · ${openThreads.length} open`,
                )}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[0.65rem]">
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 size={12} aria-hidden="true" />
                  {bt(`해결됨 ${resolvedThreads.length}`, `Resolved ${resolvedThreads.length}`)}
                </span>
                <span className="inline-flex items-center gap-1 text-warning">
                  <AlertCircle size={12} aria-hidden="true" />
                  {bt(`미해결 ${openThreads.length}`, `Open ${openThreads.length}`)}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel p-2">
              <p className="flex items-center gap-1 text-[0.68rem] font-bold text-fg">
                <UserCheck size={12} className="text-accent" aria-hidden="true" />
                {bt("다음 검수 담당자", "Next reviewers")}
              </p>
              <ul className="mt-1 space-y-0.5 text-[0.65rem] text-fg-2">
                {meta.nextReviewerIds.map((id) => {
                  const approvedNow = viewedSession.decisions.some((d) => d.reviewerId === id && d.decision === "approved");
                  return (
                    <li key={id} className={approvedNow ? "font-bold text-success" : "font-semibold text-fg"}>
                      {reviewerLabel(id, bt)} · {approvedNow ? bt("이번 리비전 승인", "Approved") : bt("재검수 대기", "Awaiting")}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
