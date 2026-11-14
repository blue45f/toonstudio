import {
  Check,
  Columns2,
  Copy,
  ExternalLink,
  Eye,
  History,
  Layers,
  Link2,
  Lock,
  MapPin,
  MessageSquarePlus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  archiveStudioReviewSession,
  restoreStudioReviewHistoryVersion,
  saveStudioReviewCheckpoint,
  type StudioReviewHistoryDocument,
} from "../studio-review-history-store";
import {
  addStudioReviewThread,
  formatCutPinTargetId,
  permissionsForStudioReviewRole,
  recordStudioReviewDecision,
  reopenStudioReviewThread,
  resolveStudioReviewThread,
  startStudioRevision,
  submitStudioReview,
  SYNTHETIC_STUDIO_REVIEW_CUTS,
  type StudioReviewPinCoordinate,
  type StudioReviewSession,
} from "../studio-review-workflow";
import {
  buildInitialCollabState,
  COLLAB_HUB_PROJECT_ID,
  CUT_OCCUPANCY_CARDS,
  resolveSafeStorage,
  REVISION_NOTES,
  WEBTOON_JOB_PRESETS,
  type WebtoonJobPresetId,
} from "./production-grand-atelier-collab-model";

export function ProductionGrandAtelierCollabHub() {
  const bt = useBilingual("ProductionGrandAtelierCollabHub");
  const storage = useMemo(() => resolveSafeStorage(), []);
  const initial = useMemo(() => buildInitialCollabState(storage), [storage]);
  const seqRef = useRef(1);

  const [jobPresetId, setJobPresetId] = useState<WebtoonJobPresetId>("lead-author");
  const [session, setSession] = useState<StudioReviewSession>(initial.session);
  const [history, setHistory] = useState<StudioReviewHistoryDocument>(initial.history);
  const [selectedCutId, setSelectedCutId] = useState<string>("cut-01");
  const [followingMember, setFollowingMember] = useState<string | null>(null);
  const [pinCoord, setPinCoord] = useState<StudioReviewPinCoordinate>({ cutId: "cut-01", xPercent: 48, yPercent: 44 });
  const [commentBody, setCommentBody] = useState("");
  const [compareMode, setCompareMode] = useState<"split" | "onion">("split");
  const [inviteHandle, setInviteHandle] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [invitedMembers, setInvitedMembers] = useState<
    readonly { readonly id: string; readonly handle: string; readonly roleKo: string; readonly roleEn: string }[]
  >([
    { id: "m-1", handle: "@minseo.color", roleKo: "선화·채색 어시", roleEn: "Line & Color Assist" },
    { id: "m-2", handle: "@junho.ink", roleKo: "선화·채색 어시", roleEn: "Line & Color Assist" },
    { id: "m-3", handle: "@hyunwoo.pd", roleKo: "편집자 · 담당 PD", roleEn: "Editor / PD" },
  ]);
  const [statusNotice, setStatusNotice] = useState<string>("");

  const activePreset = WEBTOON_JOB_PRESETS.find((item) => item.id === jobPresetId) ?? WEBTOON_JOB_PRESETS[0]!;
  const basePermissions = permissionsForStudioReviewRole(activePreset.reviewRole);
  const permissions =
    jobPresetId === "line-color-assist"
      ? { ...basePermissions, canDecide: false, canRestoreHistory: false }
      : basePermissions;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://toonstudio.local";
  const unifiedInviteUrl = `${origin}/team/people/join?project=sample-project&episode=12`;

  const activeCutThreads = session.threads.filter(
    (thread) => thread.pinCoordinate?.cutId === selectedCutId || thread.targetId.startsWith(selectedCutId),
  );
  const archivedSessions = [...history.sessions].reverse();

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
    seqRef.current += 1;
    const seq = seqRef.current;
    const nowIso = new Date().toISOString();
    const mutable = ensureMutable(session, nowIso);
    const targetCoord: StudioReviewPinCoordinate = { ...pinCoord, cutId: selectedCutId };
    const next = addStudioReviewThread(
      mutable,
      {
        id: `pin-${seq}`,
        kind: "change-request",
        targetId: formatCutPinTargetId(targetCoord),
        status: "open",
        pinCoordinate: targetCoord,
        resolvedBy: null,
        resolvedAt: null,
        messages: [
          {
            id: `msg-${seq}`,
            authorId: activePreset.actorId,
            body: trimmed,
            createdAt: nowIso,
          },
        ],
      },
      nowIso,
    );
    setSession(next);
    setCommentBody("");
    setStatusNotice(bt(`${formatCutPinTargetId(targetCoord)} 위치에 검수 핀 댓글을 남겼습니다.`, `Added pin comment at ${formatCutPinTargetId(targetCoord)}.`));
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
    setSession(approved);
    setHistory(archiveStudioReviewSession(storage, COLLAB_HUB_PROJECT_ID, approved));
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
    setSession(updated);
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
    setStatusNotice(bt(`${versionId} 시점으로 안전 복원했습니다 (직전 상태 자동 백업 완료).`, `Safely restored ${versionId} (previous state backed up).`));
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
          <Link to="/production/pinned-review" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10 gap-1.5 text-xs" })}>
            <ExternalLink size={14} aria-hidden="true" />
            {bt("외부 PD 전용 검수창", "External PD review")}
          </Link>
        </div>
      </div>

      {statusNotice ? (
        <p role="status" className="mt-3 rounded-xl border border-accent/35 bg-accent-soft/60 px-3.5 py-2 text-xs font-bold text-fg">
          {statusNotice}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-12">
        {/* ① 통합 초대 */}
        <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-5" data-testid="collab-pillar-1-invite">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              <Link2 size={16} className="text-accent" aria-hidden="true" />
              {bt("① 통합 초대 (팀 + 원고 동시 연결)", "1. Unified Invite (Team + Manuscript)")}
            </h3>
            <Link to="/team/people" className="text-xs font-bold text-accent hover:underline">
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
              className="min-h-10 flex-1 rounded-xl border border-line bg-panel px-3 text-xs text-fg-2"
            />
            <button
              type="button"
              data-testid="collab-hub-copy-invite"
              onClick={() => void copyUnifiedInvite()}
              className={buttonClass({ size: "sm", className: "min-h-10 shrink-0 gap-1.5 text-xs" })}
            >
              {inviteCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {inviteCopied ? bt("링크 복사됨", "Copied") : bt("1클릭 링크 복사", "Copy invite link")}
            </button>
          </div>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={inviteHandle}
              onChange={(event) => setInviteHandle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSendInvite();
                }
              }}
              aria-label={bt("초대할 협업자 이메일 또는 아이디", "Collaborator email or handle")}
              placeholder={bt("@아이디 또는 이메일로 직무 지정 초대", "Invite by @handle or email")}
              className="min-h-10 flex-1 rounded-xl border border-line bg-panel px-3 text-xs text-fg placeholder:text-fg-3"
            />
            <button
              type="button"
              data-testid="collab-hub-send-invite"
              onClick={handleSendInvite}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-10 shrink-0 gap-1.5 text-xs" })}
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

        {/* ② 웹툰 4대 직무별 권한 & 레이어 보호 */}
        <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-7" data-testid="collab-pillar-2-rbac">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
              {bt("② 웹툰 4대 직무별 권한 & 레이어 보호 (RBAC)", "2. Webtoon 4-Role RBAC & Layer Protection")}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-0.5 text-[0.68rem] font-bold text-fg-2">
              <Lock size={12} className="text-accent" aria-hidden="true" />
              {bt(activePreset.layerGuardKo, activePreset.layerGuardEn)}
            </span>
          </div>
          <div
            className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
            role="radiogroup"
            aria-label={bt("웹툰 직무 역할 프리셋", "Webtoon role presets")}
          >
            {WEBTOON_JOB_PRESETS.map((preset) => {
              const selected = preset.id === jobPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  data-testid={`collab-role-${preset.id}`}
                  aria-checked={selected}
                  onClick={() => setJobPresetId(preset.id)}
                  className={cn(
                    "flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    selected
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <strong className="text-xs font-black text-fg">{bt(preset.titleKo, preset.titleEn)}</strong>
                  <span className="mt-1 text-[0.68rem] leading-4 text-fg-2">{bt(preset.summaryKo, preset.summaryEn)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem]">
            <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2">
              <Layers size={12} className="text-accent" aria-hidden="true" />
              {bt("말풍선·식자 레이어: 총괄 작가 외 잠금", "Speech & lettering: locked except Lead")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2">
              {permissions.canRestoreHistory
                ? bt("이력 복원: 허용됨", "History restore: allowed")
                : bt("이력 복원: 보호 잠금됨", "History restore: locked")}
            </span>
          </div>
        </article>

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
                        setSelectedCutId(card.cutId);
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

          {/* 3단계 검수 승인 배지 & 액션 */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
              <span className={cn("rounded-full px-2.5 py-0.5", session.status === "in-review" ? "bg-warning-soft/30 text-warning" : "text-fg-3")}>
                {bt("① 검수 요청", "1. In Review")}
              </span>
              <span aria-hidden="true" className="text-fg-3">→</span>
              <span className={cn("rounded-full px-2.5 py-0.5", session.status === "changes-requested" ? "bg-accent-soft text-accent" : "text-fg-3")}>
                {bt("② 수정 중", "2. Revising")}
              </span>
              <span aria-hidden="true" className="text-fg-3">→</span>
              <span className={cn("rounded-full px-2.5 py-0.5", session.status === "approved" ? "bg-success-soft/30 text-success" : "text-fg-3")}>
                {bt("③ 승인 완료", "3. Approved")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!permissions.canDecide}
                onClick={handleRequestRevisionStage}
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-8 px-2.5 text-[0.7rem]" })}
              >
                {bt("수정 요청", "Request changes")}
              </button>
              <button
                type="button"
                data-testid="collab-hub-approve-btn"
                disabled={!permissions.canDecide}
                onClick={handleApproveStage}
                className={buttonClass({ size: "sm", className: "min-h-8 px-2.5 text-[0.7rem]" })}
              >
                {bt("검수 최종 승인", "Approve")}
              </button>
            </div>
          </div>

          {/* 컷 선택 탭 */}
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label={bt("검수 대상 컷 선택", "Select cut to review")}>
            {SYNTHETIC_STUDIO_REVIEW_CUTS.slice(0, 3).map((cut) => (
              <button
                key={cut.cutId}
                type="button"
                role="tab"
                aria-selected={selectedCutId === cut.cutId}
                onClick={() => setSelectedCutId(cut.cutId)}
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
                if (event.key === "Enter") {
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
        <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-5" data-testid="collab-pillar-5-history">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              <History size={16} className="text-accent" aria-hidden="true" />
              {bt("⑤ 수정 이력 타임라인 (안전 복원)", "5. Revision Timeline & Safe Restore")}
            </h3>
            <button
              type="button"
              data-testid="collab-hub-save-snapshot"
              disabled={!permissions.canSaveCheckpoint}
              onClick={handleSaveCheckpoint}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-8 gap-1 px-2.5 text-[0.7rem]" })}
            >
              <Save size={13} aria-hidden="true" />
              {bt("스냅샷 보관", "Save snapshot")}
            </button>
          </div>
          <p className="mt-1 text-xs text-fg-2">
            {bt(
              "작성자·메모·시각을 확인하고 복원 시 현재 상태를 먼저 자동 백업하여 유실을 방지합니다.",
              "Inspect author, note, and timestamp. Restoring automatically backs up the current version first.",
            )}
          </p>
          <ol className="mt-3 space-y-2" aria-label={bt("원고 수정 이력 목록", "Revision history list")}>
            {archivedSessions.slice(0, 5).map((item) => {
              const meta = REVISION_NOTES[item.versionId];
              return (
                <li key={item.versionId} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs font-black text-fg">{item.versionId}</strong>
                    <span className="text-[0.65rem] text-fg-3">{item.updatedAt.slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-fg-2">
                    {meta ? `${meta.authorKo} — ${bt(meta.memoKo, meta.memoEn)}` : bt(`보관된 핀 스레드 ${item.threads.length}건 스냅샷`, `Saved snapshot (${item.threads.length} pin threads)`)}
                  </p>
                  <div className="mt-2 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCompareMode("onion")}
                      className="rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] font-semibold text-fg-2 hover:text-fg"
                    >
                      {bt("어니언스킨 비교", "Compare")}
                    </button>
                    <button
                      type="button"
                      data-testid={`collab-hub-restore-${item.versionId}`}
                      disabled={!permissions.canRestoreHistory}
                      onClick={() => handleRestoreRevision(item.versionId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1 text-[0.68rem] font-bold text-fg hover:bg-raised disabled:opacity-45"
                    >
                      <RotateCcw size={12} aria-hidden="true" />
                      {bt("안전 복원", "Safe restore")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </article>
      </div>
    </section>
  );
}
