import { Columns2, ExternalLink, Eye, MapPin, MessageSquarePlus, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  archiveStudioReviewSession,
  findLatestActiveStudioReviewSession,
  readStudioReviewHistory,
  reconcileConcurrentStudioReviewMutation,
  restoreStudioReviewHistoryVersion,
  saveStudioReviewCheckpoint,
  subscribeStudioReviewHistorySync,
  type StudioReviewHistoryDocument,
} from "../studio-review-history-store";
import {
  formatCutPinTargetId,
  permissionsForStudioReviewRole,
  recordStudioReviewDecision,
  reopenStudioReviewThread,
  resolveStudioReviewThread,
  resubmitStudioRevision,
  startStudioRevision,
  submitStudioReview,
  SYNTHETIC_STUDIO_REVIEW_CUTS,
  type StudioReviewPinCoordinate,
  type StudioReviewSession,
} from "../studio-review-workflow";
import {
  planIdempotentStudioThreadSubmission,
  type CommentRetryAttempt,
} from "./production-comment-retry-guard";
import {
  buildInitialCollabState,
  COLLAB_HUB_PROJECT_ID,
  CUT_OCCUPANCY_CARDS,
  resolveSafeStorage,
  WEBTOON_JOB_PRESETS,
  type WebtoonJobPresetId,
} from "./production-grand-atelier-collab-model";
import { ProductionCollabHubInviteCard, ProductionCollabHubStageAndResubmitBar, type CollabHubStaleMutationNotice } from "./ProductionCollabHubResubmitBar";
import { ProductionCollabHubRbacCard, ProductionCollabHubTimelineSection } from "./ProductionCollabHubTimelineSection";
import { ProductionCollabHubDeepLinkBanner } from "./ProductionReviewDeepLinkBanners";
import { buildCollabHubReviewLinkPath, buildProductionReviewDeepLinkPath, resolveCollabHubDeepLinkState } from "./production-review-deep-link-model";
import { describeCollabHubPresetTransition, type PreservedDraftEntry, type RoleTransitionSummary } from "./production-role-transition-model";

const HUB_CUT_IDS = SYNTHETIC_STUDIO_REVIEW_CUTS.slice(0, 3).map((cut) => cut.cutId);

export function ProductionGrandAtelierCollabHub() {
  const bt = useBilingual("ProductionGrandAtelierCollabHub");
  const location = useLocation();
  const navigate = useNavigate();
  const storage = useMemo(() => resolveSafeStorage(), []);
  const initial = useMemo(() => buildInitialCollabState(storage), [storage]);
  const seqRef = useRef(1);

  const [jobPresetId, setJobPresetId] = useState<WebtoonJobPresetId>("lead-author");
  const [session, setSession] = useState<StudioReviewSession>(initial.session);
  const [history, setHistory] = useState<StudioReviewHistoryDocument>(initial.history);
  const deepLink = resolveCollabHubDeepLinkState({
    search: location.search,
    validCutIds: HUB_CUT_IDS,
    defaultCutId: "cut-01",
    headSession: session,
    history,
  });
  const [selectedCutId, setSelectedCutId] = useState<string>(() => deepLink.selectedCutId ?? "cut-01");
  const [followingMember, setFollowingMember] = useState<string | null>(null);
  const [pinCoord, setPinCoord] = useState<StudioReviewPinCoordinate>({ cutId: "cut-01", xPercent: 48, yPercent: 44 });
  const [commentBody, setCommentBody] = useState("");
  const [resubmitNote, setResubmitNote] = useState("");
  const [roleTransition, setRoleTransition] = useState<RoleTransitionSummary | null>(null);
  const handleSelectJobPreset = (nextPresetId: WebtoonJobPresetId) => {
    if (nextPresetId !== jobPresetId) {
      const summary = describeCollabHubPresetTransition(jobPresetId, nextPresetId);
      setRoleTransition(summary);
      setStatusNotice(bt(`직무 역할이 '${summary.previousRoleKo}' → '${summary.currentRoleKo}'(으)로 전환되었습니다. ${summary.nextActionsKo}`, `Role switched: ${summary.previousRoleEn} → ${summary.currentRoleEn}. ${summary.nextActionsEn}`));
    }
    setJobPresetId(nextPresetId);
  };
  const [compareMode, setCompareMode] = useState<"split" | "onion">("split");
  const [inviteHandle, setInviteHandle] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [reviewCopied, setReviewCopied] = useState(false);
  const [invitedMembers, setInvitedMembers] = useState<
    readonly { readonly id: string; readonly handle: string; readonly roleKo: string; readonly roleEn: string }[]
  >([
    { id: "m-1", handle: "@minseo.color", roleKo: "선화·채색 어시", roleEn: "Line & Color Assist" },
    { id: "m-2", handle: "@junho.ink", roleKo: "선화·채색 어시", roleEn: "Line & Color Assist" },
    { id: "m-3", handle: "@hyunwoo.pd", roleKo: "편집자 · 담당 PD", roleEn: "Editor / PD" },
  ]);
  const [statusNotice, setStatusNotice] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);
  const pinAttemptRef = useRef<CommentRetryAttempt | null>(null);
  const [staleMutationNotice, setStaleMutationNotice] = useState<CollabHubStaleMutationNotice | null>(null);

  useEffect(() => {
    return subscribeStudioReviewHistorySync(COLLAB_HUB_PROJECT_ID, () => {
      setHistory(readStudioReviewHistory(storage, COLLAB_HUB_PROJECT_ID));
    });
  }, [storage]);

  useEffect(() => {
    if (deepLink.selectedCutId) setSelectedCutId(deepLink.selectedCutId);
  }, [deepLink.selectedCutId, location.search]);

  const activePreset = WEBTOON_JOB_PRESETS.find((item) => item.id === jobPresetId) ?? WEBTOON_JOB_PRESETS[0]!;
  const basePermissions = permissionsForStudioReviewRole(activePreset.reviewRole);
  const rolePermissions =
    jobPresetId === "line-color-assist"
      ? { ...basePermissions, canDecide: false, canRestoreHistory: false }
      : basePermissions;
  const viewedSession = deepLink.viewedSession;
  const isHistoricalView = deepLink.isHistoricalRevision;
  const permissions = isHistoricalView || deepLink.cutIssue || deepLink.revisionIssue
    ? { ...rolePermissions, canComment: false, canResolve: false, canDecide: false }
    : rolePermissions;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://toonstudio.local";
  const unifiedInviteUrl = `${origin}/team/people/join?project=sample-project&episode=12`;
  const externalPdReviewHref = buildProductionReviewDeepLinkPath({
    projectId: "sample-project",
    episodeId: deepLink.episodeId === "episode-13" ? "episode-13" : "episode-12",
    cutId: deepLink.episodeId === "episode-13" ? "cut-13-001" : selectedCutId === "cut-01" ? "cut-12-001" : "cut-12-002",
    submissionId: isHistoricalView ? "submission-thumbnail-12-r1" : "submission-thumbnail-12-r2",
    revisionId: isHistoricalView ? "thumbnail-episode-12-r1" : "thumbnail-episode-12-r2",
  });

  const activeCutThreads = viewedSession.threads.filter(
    (thread) => thread.pinCoordinate?.cutId === selectedCutId || thread.targetId.startsWith(selectedCutId),
  );
  const archivedSessions = [...history.sessions].reverse();
  const latestActiveSession = findLatestActiveStudioReviewSession(history, session.documentId);
  const effectiveLatestVersionId = latestActiveSession?.versionId ?? session.versionId;
  const concurrentNewerVersionId =
    !isHistoricalView && latestActiveSession && latestActiveSession.versionId !== viewedSession.versionId
      ? latestActiveSession.versionId
      : null;

  const syncHubReviewUrl = (nextCutId: string, nextRevisionId: string) => {
    const nextPath = buildCollabHubReviewLinkPath({
      episodeId: deepLink.episodeId,
      cutId: nextCutId,
      revisionId: nextRevisionId,
      pathname: location.pathname,
    });
    const qIdx = nextPath.indexOf("?");
    navigate({ pathname: location.pathname, search: qIdx >= 0 ? nextPath.slice(qIdx) : "" }, { replace: true });
  };

  const handleSelectHubCut = (nextCutId: string) => {
    setSelectedCutId(nextCutId);
    if (location.search.includes("cut=") || location.search.includes("revision=") || location.search.includes("episode=")) {
      syncHubReviewUrl(nextCutId, viewedSession.versionId);
    }
  };

  const handleCopyHubReviewLink = async () => {
    const relPath = buildCollabHubReviewLinkPath({
      episodeId: deepLink.episodeId,
      cutId: selectedCutId,
      revisionId: viewedSession.versionId,
      pathname: location.pathname,
    });
    syncHubReviewUrl(selectedCutId, viewedSession.versionId);
    try {
      await navigator.clipboard?.writeText(`${origin}${relPath}`);
    } catch {
      // 클립보드 권한이 제한된 환경에서도 URL 쿼리 동기화로 고정 링크를 보존한다.
    }
    setReviewCopied(true);
    setStatusNotice(bt(`고정 검수 링크(${deepLink.episodeId} · ${selectedCutId} · ${viewedSession.versionId})를 복사했습니다.`, `Copied review link (${deepLink.episodeId} · ${selectedCutId} · ${viewedSession.versionId}).`));
  };

  const mismatchMessage = deepLink.cutIssue || deepLink.revisionIssue
    ? bt(
        "검수 링크의 컷 또는 리비전 식별자가 현재 원고 이력과 일치하지 않아 다른 대상으로 조용히 대체하지 않았습니다.",
        "Cut or revision in the review link did not match this manuscript's history; did not silently substitute another target.",
      )
    : null;

  const copyUnifiedInvite = async () => {
    try {
      await navigator.clipboard?.writeText(unifiedInviteUrl);
    } catch {
      // 클립보드 미지원 환경에서도 링크는 읽기 전용 필드로 노출된다.
    }
    setInviteCopied(true);
    setStatusNotice(bt("팀 + 12화 원고 동시 연결 초대 링크를 복사했습니다.", "Copied unified team + Ep.12 invite link."));
  };

  const handleSendInvite = () => {
    const trimmed = inviteHandle.trim();
    if (!trimmed) return;
    seqRef.current += 1;
    const seq = seqRef.current;
    setInvitedMembers((current) => [
      { id: `inv-${seq}`, handle: trimmed, roleKo: activePreset.titleKo, roleEn: activePreset.titleEn },
      ...current,
    ]);
    setInviteHandle("");
    setStatusNotice(bt(`${trimmed} 님을 '${activePreset.titleKo}' 권한으로 연결했습니다.`, `Invited ${trimmed} as ${activePreset.titleEn}.`));
  };

  const ensureMutable = (current: StudioReviewSession, nowIso: string): StudioReviewSession => {
    if (current.status === "approved") {
      const transition = startStudioRevision(current, {
        nextVersionId: `v${15 + history.sessions.length}-rev`,
        actorId: activePreset.actorId,
        createdAt: nowIso,
      });
      return submitStudioReview(transition.next, nowIso);
    }
    return current;
  };

  const handleCanvasPinPick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!permissions.canComment) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = rect.width > 0 ? Math.min(94, Math.max(6, Math.round(((event.clientX - rect.left) / rect.width) * 100))) : 50;
    const yPercent = rect.height > 0 ? Math.min(94, Math.max(6, Math.round(((event.clientY - rect.top) / rect.height) * 100))) : 50;
    setPinCoord({ cutId: selectedCutId, xPercent, yPercent });
  };

  const handleAddPinComment = () => {
    const trimmed = commentBody.trim();
    if (!trimmed || !permissions.canComment) return;
    const nowIso = new Date().toISOString();
    const mutable = ensureMutable(session, nowIso);
    const targetCoord: StudioReviewPinCoordinate = { ...pinCoord, cutId: selectedCutId };
    const targetId = formatCutPinTargetId(targetCoord);
    const planned = planIdempotentStudioThreadSubmission({
      session: mutable,
      previousAttempt: pinAttemptRef.current,
      createId: (prefix) => { seqRef.current += 1; return `${prefix}-${seqRef.current}`; },
      entityPrefix: "pin",
      secondaryPrefix: "msg",
      kind: "change-request",
      targetId,
      authorId: activePreset.actorId,
      body: trimmed,
      pinCoordinate: targetCoord,
      nowIso,
    });
    pinAttemptRef.current = planned.attempt;
    try {
      const archived = archiveStudioReviewSession(storage, COLLAB_HUB_PROJECT_ID, planned.nextSession);
      setSession(planned.nextSession);
      setHistory(archived);
      pinAttemptRef.current = null;
      setPinError(null);
      setCommentBody("");
      setStatusNotice(
        planned.alreadyExisted
          ? bt(`${targetId}에 같은 핀 댓글이 이미 한 번 기록되어 중복 생성하지 않았습니다.`, `Same pin comment already exists once at ${targetId}; skipped duplicate.`)
          : bt(`${targetId} 위치에 검수 핀 댓글을 남겼습니다.`, `Added pin comment at ${targetId}.`),
      );
    } catch (cause) {
      setPinError(
        cause instanceof Error
          ? `${cause.message} — 작성한 핀 댓글과 좌표를 그대로 유지했습니다.`
          : bt("핀 댓글을 저장하지 못했습니다. 작성한 내용과 좌표를 유지했습니다.", "Could not save pin comment. Your text and coordinates were preserved."),
      );
    }
  };

  const handleToggleResolve = (threadId: string, currentlyResolved: boolean) => {
    if (!permissions.canResolve) return;
    const nowIso = new Date().toISOString();
    const mutable = ensureMutable(session, nowIso);
    const next = currentlyResolved
      ? reopenStudioReviewThread(mutable, threadId, activePreset.actorId, nowIso)
      : resolveStudioReviewThread(mutable, threadId, activePreset.actorId, nowIso);
    setSession(next);
  };

  const handleApproveStage = () => {
    if (!permissions.canDecide) return;
    const nowIso = new Date().toISOString();
    let working = ensureMutable(session, nowIso);
    for (const thread of working.threads) {
      if (thread.kind === "change-request" && thread.status === "open") {
        working = resolveStudioReviewThread(working, thread.id, activePreset.actorId, nowIso);
      }
    }
    const approved = recordStudioReviewDecision(working, {
      reviewerId: "demo-reviewer-pd",
      decision: "approved",
      note: "컷별 검수 및 채색 대비 확인 완료",
      decidedAt: nowIso,
    });
    const reconciled = reconcileConcurrentStudioReviewMutation(storage, COLLAB_HUB_PROJECT_ID, approved);
    setSession(reconciled.latestHead);
    setHistory(reconciled.history);
    if (reconciled.outcome === "stale-superseded") {
      setStaleMutationNotice({
        staleVersionId: approved.versionId,
        latestVersionId: reconciled.latestHead.versionId,
        actionKind: "approved",
      });
      setStatusNotice(
        bt(
          `구버전(${approved.versionId}) 승인으로만 기록했습니다. 최신본(${reconciled.latestHead.versionId}) 승인이나 최신 상태는 덮어쓰지 않았습니다.`,
          `Recorded as older revision (${approved.versionId}) approval; latest (${reconciled.latestHead.versionId}) state was preserved.`,
        ),
      );
      return;
    }
    setStaleMutationNotice(null);
    setStatusNotice(bt("12화 원고 검수를 최종 승인 완료 상태로 전환했습니다.", "Marked Episode 12 review as approved."));
  };

  const handleRequestRevisionStage = () => {
    if (!permissions.canDecide) return;
    const nowIso = new Date().toISOString();
    const working = ensureMutable(session, nowIso);
    const updated = recordStudioReviewDecision(working, {
      reviewerId: "demo-reviewer-pd",
      decision: "changes-requested",
      note: "핀 위치 보완 후 재검수 요청",
      decidedAt: nowIso,
    });
    const reconciled = reconcileConcurrentStudioReviewMutation(storage, COLLAB_HUB_PROJECT_ID, updated);
    setSession(reconciled.latestHead);
    setHistory(reconciled.history);
    if (reconciled.outcome === "stale-superseded") {
      setStaleMutationNotice({
        staleVersionId: updated.versionId,
        latestVersionId: reconciled.latestHead.versionId,
        actionKind: "changes-requested",
      });
      setStatusNotice(
        bt(
          `구버전(${updated.versionId}) 수정 요청 응답으로 처리하여 최신본(${reconciled.latestHead.versionId}) 상태를 덮지 않았습니다.`,
          `Handled on older revision (${updated.versionId}); preserved latest (${reconciled.latestHead.versionId}).`,
        ),
      );
      return;
    }
    setStaleMutationNotice(null);
    setStatusNotice(bt("수정 중(보완 요청) 단계로 전환했습니다.", "Switched stage to revision in progress."));
  };

  const handleSaveCheckpoint = () => {
    if (!permissions.canSaveCheckpoint) return;
    const nowIso = new Date().toISOString();
    const nextHistory = saveStudioReviewCheckpoint(
      storage,
      COLLAB_HUB_PROJECT_ID,
      session,
      `snap-${history.sessions.length + 1}`,
      nowIso,
    );
    setHistory(nextHistory);
    setStatusNotice(bt("현재 원고·핀 상태를 이력 타임라인에 보관했습니다.", "Saved current checkpoint to history timeline."));
  };

  const handleRestoreRevision = (versionId: string) => {
    if (!permissions.canRestoreHistory) return;
    const nowIso = new Date().toISOString();
    const result = restoreStudioReviewHistoryVersion(
      storage,
      COLLAB_HUB_PROJECT_ID,
      session,
      versionId,
      nowIso,
    );
    setSession(result.restored);
    setHistory(result.history);
    if (isHistoricalView) syncHubReviewUrl(selectedCutId, result.restored.versionId);
    setStatusNotice(bt(`${versionId} 시점으로 안전 복원했습니다 (직전 상태 자동 백업 완료).`, `Safely restored ${versionId} (previous state backed up).`));
  };

  const handleResubmitHubRevision = (input: {
    readonly changedCutIds: readonly string[];
    readonly resolveThreadIds: readonly string[];
    readonly note: string;
  }) => {
    if (!permissions.canEditManuscript) return;
    const nowIso = new Date().toISOString();
    const nextVersionId = `v${15 + history.sessions.length}-resubmit`;
    const transition = resubmitStudioRevision(session, {
      nextVersionId,
      actorId: activePreset.actorId,
      changedCutIds: input.changedCutIds,
      resolveThreadIds: input.resolveThreadIds,
      note: input.note,
      resubmittedAt: nowIso,
    });
    archiveStudioReviewSession(storage, COLLAB_HUB_PROJECT_ID, transition.previous);
    const nextHistory = archiveStudioReviewSession(storage, COLLAB_HUB_PROJECT_ID, transition.next);
    setSession(transition.next);
    setHistory(nextHistory);
    if (location.search.includes("revision=") || location.search.includes("cut=") || location.search.includes("episode=")) {
      syncHubReviewUrl(selectedCutId, transition.next.versionId);
    }
    setStatusNotice(
      bt(
        `${nextVersionId} 새 리비전을 재제출했습니다. 기존 승인 없이 0/${transition.next.requiredReviewerIds.length || 1}부터 재검수합니다.`,
        `Resubmitted ${nextVersionId}. Approvals reset to 0/${transition.next.requiredReviewerIds.length || 1}.`,
      ),
    );
  };

  return (
    <section
      aria-labelledby="grand-atelier-collab-hub-title"
      data-testid="grand-atelier-collab-hub"
      className="mt-6 rounded-3xl border border-accent/30 bg-panel p-4 shadow-xl sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <img
            src="/brand/toonstudio-premium-icons/team.webp"
            alt=""
            width={42}
            height={42}
            aria-hidden="true"
            className="size-10 shrink-0 rounded-2xl object-cover"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="grand-atelier-collab-hub-title" className="text-lg font-black tracking-tight text-fg sm:text-xl">
                {bt("초대 · 직무 권한 · 실시간 컷 · 핀 검수 · 이력 원스톱 관제실", "5-Pillar Collaboration Control Room")}
              </h2>
              <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 text-[0.68rem] font-bold text-accent">
                {bt("합성 데모 · 고객 데이터 없음", "Synthetic demo · zero customer data")}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-fg-2">
              {bt(
                "깊은 하위 탭을 찾지 않고 한 화면에서 팀 초대, 4대 웹툰 직무 잠금, 컷 점유 따라가기, 전후 핀 검수, 안전 이력 복원을 바로 실행합니다.",
                "Invite collaborators, configure 4 webtoon job locks, follow cut occupancy, review coordinate pins, and restore history on one screen.",
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/studio/comic" className={buttonClass({ size: "sm", className: "min-h-10 gap-1.5 text-xs" })}>
            <Sparkles size={14} aria-hidden="true" />
            {bt("공동 드로잉 열기", "Open shared canvas")}
          </Link>
          <Link to={externalPdReviewHref} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10 gap-1.5 text-xs" })}>
            <ExternalLink size={14} aria-hidden="true" />
            {bt("외부 PD 전용 검수창", "External PD review")}
          </Link>
        </div>
      </div>

      <ProductionCollabHubDeepLinkBanner
        episodeId={deepLink.episodeId}
        selectedCutId={selectedCutId}
        viewedRevisionId={viewedSession.versionId}
        latestRevisionId={session.versionId}
        isHistorical={isHistoricalView}
        mismatchMessage={mismatchMessage}
        reviewCopied={reviewCopied}
        onCopyReviewLink={() => void handleCopyHubReviewLink()}
        onSwitchToLatest={() => syncHubReviewUrl(selectedCutId, session.versionId)}
      />

      {statusNotice ? (
        <p role="status" className="mt-3 rounded-xl border border-accent/35 bg-accent-soft/60 px-3.5 py-2 text-xs font-bold text-fg">
          {statusNotice}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-12">
        {/* ① 통합 초대 */}
        <ProductionCollabHubInviteCard
          unifiedInviteUrl={unifiedInviteUrl}
          inviteCopied={inviteCopied}
          inviteHandle={inviteHandle}
          invitedMembers={invitedMembers}
          onCopyInvite={() => void copyUnifiedInvite()}
          onChangeHandle={setInviteHandle}
          onSendInvite={handleSendInvite}
        />

        {/* ② 웹툰 4대 직무별 권한 & 레이어 보호 */}
        <ProductionCollabHubRbacCard
          activePreset={activePreset}
          jobPresetId={jobPresetId}
          canRestoreHistory={permissions.canRestoreHistory}
          onSelectPreset={handleSelectJobPreset}
        />

        {/* ③ 실시간 공동 작업 & 컷 점유 */}
        <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-12" data-testid="collab-pillar-3-presence">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black text-fg">
                <Users size={16} className="text-accent" aria-hidden="true" />
                {bt("③ 실시간 공동 작업 & 컷 점유 현황", "3. Live Co-Editing & Cut Occupancy")}
              </h3>
              <p className="mt-0.5 text-xs text-fg-2">
                {bt(
                  "누가 몇 번 컷을 작업 중인지 충돌 없이 확인하고 '따라가기'로 해당 컷 시점으로 즉시 이동합니다.",
                  "See which collaborator occupies each cut and jump straight to their viewport.",
                )}
              </p>
            </div>
            {followingMember ? (
              <span className="rounded-full border border-success/40 bg-success-soft/20 px-3 py-1 text-xs font-bold text-success">
                {bt(`현재 시점 따라가기 중: ${followingMember}`, `Following: ${followingMember}`)}
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2.5 md:grid-cols-3">
            {CUT_OCCUPANCY_CARDS.map((card) => {
              const active = selectedCutId === card.cutId;
              return (
                <div
                  key={card.cutId}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border p-3",
                    active ? "border-accent/60 bg-accent-soft/40" : "border-line bg-panel",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-accent px-2 py-0.5 text-[0.68rem] font-black text-on-accent">
                        {bt(card.cutBadgeKo, card.cutBadgeEn)}
                      </span>
                      <strong className="truncate text-xs font-black text-fg">{bt(card.memberKo, card.memberEn)}</strong>
                    </div>
                    <p className="mt-1 truncate text-xs text-fg-2">{bt(card.activityKo, card.activityEn)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      data-testid={`collab-follow-${card.cutId}`}
                      onClick={() => {
                        handleSelectHubCut(card.cutId);
                        setFollowingMember(bt(card.memberKo, card.memberEn));
                      }}
                      className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9 px-2.5 text-xs" })}
                    >
                      {bt("따라가기 ↗", "Follow ↗")}
                    </button>
                    <Link
                      to={card.episodeHref}
                      className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-9 px-2 text-xs" })}
                    >
                      {bt("룸", "Room")}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        {/* ④ 좌표 핀 댓글 · 전후 비교 · 3단계 검수 승인 */}
        <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-7" data-testid="collab-pillar-4-review">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              <MapPin size={16} className="text-accent" aria-hidden="true" />
              {bt("④ 좌표 핀 댓글 · 전후 비교 · 3단계 검수 승인", "4. Coordinate Pin Review · Diff · 3-Stage Approval")}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-pressed={compareMode === "split"}
                onClick={() => setCompareMode("split")}
                className={buttonClass({ variant: compareMode === "split" ? "solid" : "outline", size: "sm", className: "min-h-11 gap-1 px-2.5 text-[0.7rem]" })}
              >
                <Columns2 size={13} aria-hidden="true" />
                {bt("나란히 비교", "Side-by-side")}
              </button>
              <button
                type="button"
                aria-pressed={compareMode === "onion"}
                onClick={() => setCompareMode("onion")}
                className={buttonClass({ variant: compareMode === "onion" ? "solid" : "outline", size: "sm", className: "min-h-11 gap-1 px-2.5 text-[0.7rem]" })}
              >
                <Eye size={13} aria-hidden="true" />
                {bt("어니언스킨 겹쳐보기", "Onion-skin")}
              </button>
            </div>
          </div>

          {/* 3단계 검수 승인 배지 & 재제출 */}
          <ProductionCollabHubStageAndResubmitBar
            viewedSession={viewedSession}
            selectedCutId={selectedCutId}
            isHistoricalView={isHistoricalView}
            canDecide={permissions.canDecide}
            canEditManuscript={permissions.canEditManuscript}
            resubmitNote={resubmitNote}
            onChangeResubmitNote={setResubmitNote}
            roleTransition={roleTransition}
            preservedDraftEntries={(
              [
                { label: "선택 좌표 핀 피드백", value: commentBody, locked: !permissions.canComment },
                { label: "협업 허브 재제출 메모", value: resubmitNote, locked: !permissions.canEditManuscript },
              ] satisfies readonly PreservedDraftEntry[]
            ).filter((entry) => entry.value.trim().length > 0)}
            onDismissRoleTransition={() => setRoleTransition(null)}
            concurrentNewerVersionId={concurrentNewerVersionId}
            staleMutationNotice={staleMutationNotice}
            onSwitchToConcurrentLatest={() => { if (latestActiveSession) { setSession(latestActiveSession); setStaleMutationNotice(null); } }}
            onDismissStaleNotice={() => setStaleMutationNotice(null)}
            onRequestRevisionStage={handleRequestRevisionStage}
            onApproveStage={handleApproveStage}
            onSelectCut={handleSelectHubCut}
            onResubmitRevision={handleResubmitHubRevision}
          />

          {/* 컷 선택 탭 */}
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label={bt("검수 대상 컷 선택", "Select cut to review")}>
            {SYNTHETIC_STUDIO_REVIEW_CUTS.slice(0, 3).map((cut) => (
              <button
                key={cut.cutId}
                type="button"
                role="tab"
                aria-selected={selectedCutId === cut.cutId}
                onClick={() => handleSelectHubCut(cut.cutId)}
                className={cn(
                  "min-h-8 rounded-lg border px-2.5 text-xs font-bold",
                  selectedCutId === cut.cutId
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:text-fg",
                )}
              >
                {bt(cut.labelKo, cut.labelEn)}
              </button>
            ))}
          </div>

          {/* 전후 비교 + 좌표 핀 캔버스 */}
          <div className="relative mt-2.5 h-44 overflow-hidden rounded-2xl border border-line bg-panel">
            {compareMode === "split" ? (
              <div className="grid h-full grid-cols-2 divide-x divide-line">
                <div className="relative h-full overflow-hidden">
                  <img
                    src="/brand/lobby-hq-20261003/canvas-noir-768.webp"
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover opacity-75"
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-canvas/85 px-2 py-0.5 text-[0.65rem] font-bold text-fg-2">
                    {bt("이전 · v12 선화본", "Before · v12 Line")}
                  </span>
                </div>
                <div className="relative h-full overflow-hidden">
                  <img
                    src="/brand/lobby-hq-20261003/project-crimson-960.webp"
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover opacity-85"
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-accent px-2 py-0.5 text-[0.65rem] font-bold text-on-accent">
                    {bt("현재 · v14 채색 보강본", "After · v14 Color")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="relative h-full w-full">
                <img
                  src="/brand/lobby-hq-20261003/canvas-noir-768.webp"
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover opacity-65"
                />
                <img
                  src="/brand/lobby-hq-20261003/project-crimson-960.webp"
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover opacity-55 mix-blend-screen"
                />
                <span className="absolute left-2 top-2 rounded-md bg-canvas/85 px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                  {bt("어니언스킨 투과 비교 (v12 + v14)", "Onion-skin overlay (v12 + v14)")}
                </span>
              </div>
            )}

            <button
              type="button"
              data-testid="collab-hub-pin-canvas"
              disabled={!permissions.canComment}
              onClick={handleCanvasPinPick}
              aria-label={bt("전후 비교 원고 위 핀 좌표 지정", "Pick coordinate pin on comparison frame")}
              className="absolute inset-0 z-10 w-full bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            />

            {activeCutThreads.map((thread, idx) => {
              const coord = thread.pinCoordinate;
              if (!coord) return null;
              return (
                <span
                  key={thread.id}
                  style={{ left: `${coord.xPercent}%`, top: `${coord.yPercent}%` }}
                  className={cn(
                    "pointer-events-none absolute z-20 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[0.68rem] font-black shadow",
                    thread.status === "resolved"
                      ? "border-success bg-success-soft text-success"
                      : "border-accent bg-accent text-on-accent",
                  )}
                >
                  {idx + 1}
                </span>
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              disabled={!permissions.canComment}
              value={commentBody}
              onChange={(event) => setCommentBody(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  handleAddPinComment();
                }
              }}
              aria-label={bt("선택 좌표 핀 피드백 입력", "Enter coordinate pin feedback")}
              placeholder={
                permissions.canComment
                  ? `${formatCutPinTargetId({ ...pinCoord, cutId: selectedCutId })} — ${bt("수정 피드백 입력", "Write pin feedback")}`
                  : bt("외부 열람자 권한에서는 댓글 작성이 잠겨 있습니다", "Comments are locked in Viewer role")
              }
              className="min-h-10 flex-1 rounded-xl border border-line bg-panel px-3 text-xs text-fg placeholder:text-fg-3 disabled:opacity-50"
            />
            <button
              type="button"
              data-testid="collab-hub-add-pin-btn"
              disabled={!permissions.canComment}
              onClick={handleAddPinComment}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10 shrink-0 gap-1.5 text-xs" })}
            >
              <MessageSquarePlus size={14} aria-hidden="true" />
              {bt("핀 댓글 등록", "Add pin")}
            </button>
          </div>
          {pinError ? (
            <div role="alert" data-testid="collab-hub-pin-error" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs text-fg">
              <span>{pinError}</span>
              <button type="button" data-testid="collab-hub-retry-pin-btn" onClick={handleAddPinComment} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-8 px-2.5 text-[0.7rem]" })}>
                {bt("같은 핀 댓글 다시 보내기", "Retry sending same pin")}
              </button>
            </div>
          ) : null}

          <ul className="mt-2.5 space-y-1.5" aria-label={bt("컷 핀 댓글 목록", "Pinned comments on selected cut")}>
            {activeCutThreads.map((thread, idx) => (
              <li key={thread.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs">
                <span className="min-w-0 truncate text-fg-2">
                  <strong className="text-fg">#{idx + 1} {thread.targetId}:</strong> {thread.messages.at(-1)?.body}
                </span>
                <button
                  type="button"
                  disabled={!permissions.canResolve}
                  onClick={() => handleToggleResolve(thread.id, thread.status === "resolved")}
                  className="shrink-0 rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] font-bold text-fg hover:bg-raised disabled:opacity-45"
                >
                  {thread.status === "resolved" ? bt("재오픈", "Reopen") : bt("해결 처리", "Resolve")}
                </button>
              </li>
            ))}
          </ul>
        </article>

        {/* ⑤ 수정 이력 타임라인 */}
        <ProductionCollabHubTimelineSection
          archivedSessions={archivedSessions}
          latestRevisionId={effectiveLatestVersionId}
          viewedRevisionId={viewedSession.versionId}
          canSaveCheckpoint={permissions.canSaveCheckpoint}
          canRestoreHistory={permissions.canRestoreHistory}
          onSaveCheckpoint={handleSaveCheckpoint}
          onPinViewRevision={(versionId) => syncHubReviewUrl(selectedCutId, versionId)}
          onCompareOnion={() => setCompareMode("onion")}
          onRestoreRevision={handleRestoreRevision}
        />
      </div>
    </section>
  );
}
