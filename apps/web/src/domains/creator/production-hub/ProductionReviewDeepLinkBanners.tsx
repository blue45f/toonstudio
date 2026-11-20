import {
  AlertTriangle,
  Check,
  Columns2,
  Copy,
  History,
  Link2,
  MessageCirclePlus,
  MessagesSquare,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";

import type { ClarificationThread, CutPlan, Submission } from "@toonstudio/core/production";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StaleSubmissionDecisionNotice } from "./production-concurrent-review-guard";
import type { SubmissionRevisionFreshness } from "./production-review-deep-link-model";
import {
  formatPreservedDraftClipboardText,
  type PreservedDraftEntry,
  type RoleTransitionSummary,
} from "./production-role-transition-model";

export function ProductionRoleTransitionBanner({
  transition,
  preservedEntries = [],
  onDismiss,
  testId = "production-role-transition-banner",
  copyTestId = "production-copy-preserved-draft",
  className = "mt-3",
}: {
  readonly transition: RoleTransitionSummary;
  readonly preservedEntries?: readonly PreservedDraftEntry[];
  readonly onDismiss?: () => void;
  readonly testId?: string;
  readonly copyTestId?: string;
  readonly className?: string;
}) {
  const bt = useBilingual("ProductionReviewDeepLinkBanners.roleTransition");
  const [copied, setCopied] = useState(false);
  const clipboardText = formatPreservedDraftClipboardText(preservedEntries);
  const nonEmptyCount = preservedEntries.filter((entry) => entry.value.trim().length > 0).length;

  const handleCopy = async () => {
    if (!clipboardText) return;
    try {
      await navigator.clipboard?.writeText(clipboardText);
    } catch {
      // 클립보드 권한이 제한된 환경에서도 화면 입력값과 상태 속성에 보존된다.
    }
    setCopied(true);
  };

  return (
    <div
      role="status"
      data-testid={testId}
      data-role-direction={transition.direction}
      data-preserved-draft-copied={copied ? "true" : "false"}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-xs text-fg",
        transition.direction === "downgraded"
          ? "border-warn/50 bg-warn/15"
          : "border-accent/45 bg-accent-soft/45",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-1.5 font-semibold text-fg">
          <ShieldAlert className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            {bt(
              `역할 변경 안내: ${transition.previousRoleKo} → ${transition.currentRoleKo}`,
              `Role changed: ${transition.previousRoleEn} → ${transition.currentRoleEn}`,
            )}
          </span>
        </p>
        <p className="leading-5 text-fg-2">
          <strong className="text-fg">{bt("다음 가능한 행동:", "Next available actions:")}</strong>{" "}
          {bt(transition.nextActionsKo, transition.nextActionsEn)}
        </p>
        {nonEmptyCount > 0 ? (
          <p className="text-xs font-semibold text-fg-2">
            {bt(
              `작성 중이던 내용 ${nonEmptyCount}건을 지우지 않고 정책 범위에서 그대로 보존했습니다.`,
              `Preserved ${nonEmptyCount} authored draft(s) in place within policy bounds.`,
            )}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {clipboardText ? (
          <button
            type="button"
            data-testid={copyTestId}
            onClick={() => void handleCopy()}
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9 gap-1.5 text-xs" })}
          >
            {copied ? <Check className="size-3.5 text-good" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied
              ? bt("남은 작성 내용 복사됨", "Preserved draft copied")
              : bt("남은 작성 내용 복사", "Copy preserved draft")}
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-9 text-xs" })}
          >
            {bt("확인", "Dismiss")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ProductionReviewCutCard({
  cut,
  selected,
  issues,
  revisionLabel,
  muted = false,
  onSelect,
}: {
  readonly cut: CutPlan;
  readonly selected: boolean;
  readonly issues: number;
  readonly revisionLabel: string;
  readonly muted?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${cut.cutId} 검수 선택`}
      onClick={onSelect}
      className={cn(
        "relative min-h-48 w-full overflow-hidden rounded-xl border bg-gradient-to-br from-raised via-panel to-accent-soft text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent",
        selected ? "border-accent" : "border-line hover:border-accent/45",
        muted && "opacity-55 grayscale-[35%]",
      )}
    >
      <div className="absolute left-[8%] top-[10%] h-[34%] w-[44%] rounded-[55%_45%_48%_52%] border border-line-strong/50 bg-card/65" />
      <div className="absolute bottom-[18%] right-[10%] h-[42%] w-[35%] rounded-t-full border border-line-strong/45 bg-raised/75" />
      <div className="absolute inset-x-3 bottom-3 rounded-lg border border-line/70 bg-card/90 p-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-accent">{cut.cutId}</span>
          <span className="text-xs text-fg-3">{revisionLabel}</span>
        </div>
        <p className="mt-1 text-xs font-semibold text-fg">{cut.framing}</p>
        <p className="mt-1 line-clamp-1 text-xs text-fg-3">{cut.camera}</p>
      </div>
      {issues > 0 ? (
        <span
          className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full border-2 border-card bg-bad text-xs font-semibold text-on-accent"
          aria-label={`${issues}개 검수 이슈`}
        >
          {issues}
        </span>
      ) : null}
    </button>
  );
}

export function ProductionStaleDecisionBanner({
  notice,
  onOpenLatest,
  onDismiss,
}: {
  readonly notice: StaleSubmissionDecisionNotice;
  readonly onOpenLatest: (submissionId: string) => void;
  readonly onDismiss: () => void;
}) {
  const bt = useBilingual("ProductionReviewDeepLinkBanners.staleDecision");
  const latestRev = notice.latestSubmission?.revisionRef.revision ?? null;
  const actionKo = notice.value === "approve" || notice.value === "approve-with-conditions" ? "승인" : "수정 요청";
  const actionEn = notice.value === "approve" || notice.value === "approve-with-conditions" ? "approval" : "change request";

  return (
    <div
      role="alert"
      data-review-stale-decision-notice="true"
      className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/50 bg-warn/15 p-3 text-xs text-fg"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-1.5 font-semibold text-warn">
          <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {bt(
              `구버전(${notice.staleRevisionNumber}차 제출본) ${actionKo}으로 기록됨 · ${latestRev ? `최신본(${latestRev}차)` : "최신본"} 승인으로 반영되지 않음`,
              `Recorded as older rev. ${notice.staleRevisionNumber} ${actionEn} · NOT counted as ${latestRev ? `latest rev. ${latestRev}` : "latest"} approval`,
            )}
          </span>
        </p>
        <p className="leading-5 text-fg-2">
          {bt(
            `검수 응답 도착 중 새 리비전${latestRev ? `(${latestRev}차 · ${notice.latestSubmission?.revisionRef.id})` : ""}이 제출되었습니다. 뒤늦은 응답이 최신본의 승인이나 검수 상태를 덮어쓰지 않도록 보호했으며, ${notice.staleRevisionNumber}차 구버전 이력에만 남겼습니다.`,
            `A newer revision${latestRev ? ` (rev. ${latestRev})` : ""} was submitted while your review was in flight. Your late response stayed on rev. ${notice.staleRevisionNumber} and did not overwrite the latest state.`,
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {notice.latestSubmission ? (
          <button
            type="button"
            data-review-open-latest-from-stale="true"
            onClick={() => onOpenLatest(notice.latestSubmission!.id)}
            className={buttonClass({ size: "sm", className: "min-h-9 gap-1.5 text-xs" })}
          >
            {bt(`최신본(${notice.latestSubmission.revisionRef.revision}차) 열기`, `Open latest (rev. ${notice.latestSubmission.revisionRef.revision})`)}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9 text-xs" })}
        >
          {bt("확인", "Dismiss")}
        </button>
      </div>
    </div>
  );
}

export interface ProductionWorkspaceDeepLinkBannersProps {
  readonly episodeId: string;
  readonly cutId: string | null;
  readonly submission: Submission | null;
  readonly freshness: SubmissionRevisionFreshness;
  readonly linkMismatchMessages: readonly string[];
  readonly roleTransition?: RoleTransitionSummary | null;
  readonly preservedDraftEntries?: readonly PreservedDraftEntry[];
  readonly onDismissRoleTransition?: () => void;
  readonly onSwitchToLatest: (latestSubmissionId: string) => void;
  readonly onCompareMode: () => void;
}

export function ProductionWorkspaceDeepLinkBanners({
  episodeId,
  cutId,
  submission,
  freshness,
  linkMismatchMessages,
  roleTransition = null,
  preservedDraftEntries = [],
  onDismissRoleTransition,
  onSwitchToLatest,
  onCompareMode,
}: ProductionWorkspaceDeepLinkBannersProps) {
  const bt = useBilingual("ProductionReviewDeepLinkBanners.workspace");
  return (
    <>
      {roleTransition ? (
        <ProductionRoleTransitionBanner
          transition={roleTransition}
          preservedEntries={preservedDraftEntries}
          onDismiss={onDismissRoleTransition}
        />
      ) : null}
      {freshness.kind === "historical" && submission ? (
        <div
          role="region"
          aria-label={bt("이전 고정 리비전 열람 안내", "Historical pinned revision notice")}
          data-review-revision-freshness="historical"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/45 bg-warn/10 p-3 text-xs text-fg"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-warn">
              <History className="size-4 shrink-0" aria-hidden="true" />
              <span>{bt("이전 고정 리비전(구버전) 열람 중 · 최신본 아님", "Viewing pinned older revision · NOT the latest version")}</span>
            </p>
            <p className="leading-5 text-fg-2">
              {freshness.latestSubmission
                ? bt(
                    `현재 열람 중인 고정 대상은 ${episodeId} · ${cutId ?? "컷 미선택"} · ${submission.revisionRef.revision}차(${submission.revisionRef.id})입니다. 이 산출물에는 더 최신 제출본인 ${freshness.latestSubmission.revisionRef.revision}차(${freshness.latestSubmission.revisionRef.id})가 따로 있으므로 최신본과 혼동하지 마세요. 구버전에서는 새 승인이 잠깁니다.`,
                    `You are viewing ${episodeId} · ${cutId ?? "no-cut"} · rev ${submission.revisionRef.revision} (${submission.revisionRef.id}). A newer current submission rev ${freshness.latestSubmission.revisionRef.revision} (${freshness.latestSubmission.revisionRef.id}) exists; approval is locked on older revisions.`,
                  )
                : bt(
                    `현재 산출물의 활성 최신 제출본이 아닌 이전 고정 리비전(${submission.revisionRef.id})을 열람 중입니다. 최신본과 혼동하지 마세요.`,
                    `Viewing a non-current pinned revision (${submission.revisionRef.id}). Do not confuse it with the latest manuscript.`,
                  )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {freshness.latestSubmission ? (
              <button
                type="button"
                data-review-switch-to-latest="true"
                onClick={() => onSwitchToLatest(freshness.latestSubmission!.id)}
                className={buttonClass({ size: "sm", className: "min-h-9 gap-1.5 text-xs" })}
              >
                {bt(
                  `최신본(${freshness.latestSubmission.revisionRef.revision}차) 열기`,
                  `Open latest (rev ${freshness.latestSubmission.revisionRef.revision})`,
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCompareMode}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9 gap-1 text-xs" })}
            >
              <Columns2 className="size-3.5" aria-hidden="true" />
              {bt("기준·제출 나란히 보기", "Side-by-side compare")}
            </button>
          </div>
        </div>
      ) : freshness.kind === "latest" && submission ? (
        <div
          data-review-revision-freshness="latest"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-good/30 bg-good/5 px-3 py-2 text-xs text-fg-2"
        >
          <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-fg">
            <Link2 className="size-3.5 text-good" aria-hidden="true" />
            {bt(
              `현재 최신 제출본 열람 중 · ${episodeId} · ${cutId ?? "컷 없음"} · ${submission.revisionRef.revision}차(${submission.revisionRef.id})`,
              `Viewing latest current submission · ${episodeId} · ${cutId ?? "no-cut"} · rev ${submission.revisionRef.revision} (${submission.revisionRef.id})`,
            )}
          </span>
        </div>
      ) : null}
      {linkMismatchMessages.length > 0 ? (
        <div role="alert" data-review-link-mismatch="true" className="mt-3 rounded-xl border border-bad/35 bg-bad/10 p-3 text-xs text-fg">
          {linkMismatchMessages.map((msg) => (
            <p key={msg} className="font-semibold leading-5">{msg}</p>
          ))}
        </div>
      ) : null}
    </>
  );
}

export interface ProductionCollabHubDeepLinkBannerProps {
  readonly episodeId: string;
  readonly selectedCutId: string;
  readonly viewedRevisionId: string;
  readonly latestRevisionId: string;
  readonly isHistorical: boolean;
  readonly mismatchMessage: string | null;
  readonly reviewCopied: boolean;
  readonly onCopyReviewLink: () => void;
  readonly onSwitchToLatest: () => void;
}

export function ProductionCollabHubDeepLinkBanner({
  episodeId,
  selectedCutId,
  viewedRevisionId,
  latestRevisionId,
  isHistorical,
  mismatchMessage,
  reviewCopied,
  onCopyReviewLink,
  onSwitchToLatest,
}: ProductionCollabHubDeepLinkBannerProps) {
  const bt = useBilingual("ProductionReviewDeepLinkBanners.collabHub");
  return (
    <div className="mt-3 space-y-2">
      <div
        data-collab-review-freshness={isHistorical ? "historical" : "latest"}
        data-collab-episode-id={episodeId}
        data-collab-cut-id={selectedCutId}
        data-collab-revision-id={viewedRevisionId}
        className={
          isHistorical
            ? "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/45 bg-warn/10 px-3 py-2.5 text-xs text-fg"
            : "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg-2"
        }
      >
        <div className="min-w-0 flex-1">
          {isHistorical ? (
            <p className="font-semibold text-warn">
              {bt(
                `이전 고정 리비전 열람 중 (${episodeId} · ${selectedCutId} · ${viewedRevisionId}) — 최신본(${latestRevisionId})과 혼동하지 마세요 (구버전 승인 잠금)`,
                `Viewing pinned older revision (${episodeId} · ${selectedCutId} · ${viewedRevisionId}) — latest is ${latestRevisionId} (approval locked)`,
              )}
            </p>
          ) : (
            <p className="font-semibold text-fg">
              {bt(
                `현재 검수 대상 고정 좌표: ${episodeId} · ${selectedCutId} · 최신 ${viewedRevisionId}`,
                `Pinned review target: ${episodeId} · ${selectedCutId} · latest ${viewedRevisionId}`,
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isHistorical ? (
            <button
              type="button"
              data-testid="collab-hub-switch-latest-revision"
              onClick={onSwitchToLatest}
              className={buttonClass({ size: "sm", className: "min-h-8 px-2.5 text-[0.7rem]" })}
            >
              {bt(`최신본(${latestRevisionId})으로 전환`, `Switch to latest (${latestRevisionId})`)}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="collab-hub-copy-review-link"
            onClick={onCopyReviewLink}
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-8 gap-1 px-2.5 text-[0.7rem]" })}
          >
            {reviewCopied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            {reviewCopied ? bt("검수 링크 복사됨", "Review link copied") : bt("검수 링크 복사", "Copy review link")}
          </button>
        </div>
      </div>
      {mismatchMessage ? (
        <p role="alert" data-collab-link-mismatch="true" className="rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs font-bold text-fg">
          {mismatchMessage}
        </p>
      ) : null}
    </div>
  );
}

export function ProductionReviewClarificationCards({
  selectedCut,
  comment,
  blocking,
  pending,
  canEdit,
  canCompose,
  retryAvailable,
  clarifications,
  emptyOpenQuestionsText,
  partyLabelForAssignment,
  onChangeComment,
  onChangeBlocking,
  onSubmitClarification,
}: {
  readonly selectedCut: CutPlan | null;
  readonly comment: string;
  readonly blocking: boolean;
  readonly pending: boolean;
  readonly canEdit: boolean;
  readonly canCompose: boolean;
  readonly retryAvailable: boolean;
  readonly clarifications: readonly ClarificationThread[];
  readonly emptyOpenQuestionsText: string;
  readonly partyLabelForAssignment: (assignmentId: string) => string;
  readonly onChangeComment: (next: string) => void;
  readonly onChangeBlocking: (next: boolean) => void;
  readonly onSubmitClarification: () => void;
}) {
  const bt = useBilingual("ProductionReviewDeepLinkBanners.clarification");
  const openOrAnswered = clarifications.filter(
    (entry) => entry.status === "open" || entry.status === "answered",
  );
  return (
    <>
      <section className="rounded-2xl border border-line bg-card p-3">
        <div className="flex items-center gap-2">
          <MessageCirclePlus className="size-4 text-accent" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-fg">컷 위치 질문</h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-fg-3">
          {selectedCut ? `${selectedCut.cutId}에 고정됩니다.` : "먼저 컷을 선택하세요."}
        </p>
        <textarea
          aria-label="검수 질문"
          value={comment}
          onChange={(event) => onChangeComment(event.target.value)}
          rows={3}
          disabled={pending || !canEdit || !canCompose}
          placeholder="수정 이유나 확인할 의도를 입력하세요."
          className="mt-3 w-full resize-y rounded-xl border border-line bg-panel p-3 text-xs leading-5 text-fg outline-none focus:border-accent/50 disabled:opacity-60"
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-fg-2">
          <input
            type="checkbox"
            checked={blocking}
            disabled={pending || !canEdit}
            onChange={(event) => onChangeBlocking(event.target.checked)}
            className="size-4 rounded border-line accent-[rgb(var(--accent))]"
          />
          답변 전 다음 공정 차단
        </label>
        <button
          type="button"
          className={cn(buttonClass({ size: "sm" }), "mt-3 w-full")}
          disabled={pending || !canEdit || !comment.trim() || !canCompose}
          onClick={onSubmitClarification}
        >
          <Send className="size-4" />
          {pending ? bt("전송 중…", "Sending…") : "질문 추가"}
        </button>
        {retryAvailable && !pending && comment.trim() ? (
          <div className="mt-2 rounded-xl border border-warn/35 bg-warn/10 p-2.5 text-xs text-fg-2">
            <p className="leading-4">
              {bt(
                "작성 내용을 그대로 보존했습니다. 다시 보내도 같은 질문 ID를 재사용해 중복 생성되지 않습니다.",
                "Your input is preserved. Retrying reuses the same ID so no duplicate comment is created.",
              )}
            </p>
            <button
              type="button"
              data-testid="review-retry-clarification-btn"
              disabled={!canEdit || !canCompose}
              onClick={onSubmitClarification}
              className={buttonClass({ variant: "outline", size: "sm", className: "mt-2 min-h-8 w-full gap-1 text-xs" })}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {bt("같은 질문 다시 보내기", "Retry sending same question")}
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-line bg-card p-3">
        <div className="flex items-center gap-2">
          <MessagesSquare className="size-4 text-accent" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-fg">열린 이슈</h3>
        </div>
        <div className="mt-3 space-y-2">
          {openOrAnswered.map((entry) => (
            <div
              key={entry.id}
              data-clarification-id={entry.id}
              className={cn("rounded-xl border p-2.5", entry.blocking ? "border-bad/30 bg-bad/10" : "border-line bg-panel")}
            >
              <div className="flex items-center gap-2">
                {entry.blocking ? <AlertTriangle className="size-3.5 text-bad" /> : <MessagesSquare className="size-3.5 text-fg-3" />}
                <span
                  className={cn(
                    "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                    entry.blocking ? "border-bad/35 bg-bad/10 text-bad" : "border-line bg-raised text-fg-2",
                  )}
                >
                  {entry.scope.id}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-5 text-fg">{entry.question}</p>
              <p className="mt-1 text-xs text-fg-3">
                {partyLabelForAssignment(entry.askedByAssignmentId)} → {partyLabelForAssignment(entry.answerOwnerAssignmentId)}
              </p>
            </div>
          ))}
          {openOrAnswered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-fg-3">
              {emptyOpenQuestionsText}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
