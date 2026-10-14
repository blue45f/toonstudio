import { BadgeCheck, Columns2, Info, LockKeyhole, MessageSquareMore, Mic, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ProductionProjectAggregate, ReviewLane } from "@toonstudio/core/production";

import {
  createEmptyStudioCommentsDocument,
  normalizeStudioCommentsDocument,
  serializeStudioCommentsDocument,
  type StudioCommentsDocument,
} from "../studio-comments";
import { LiveCursorOverlay } from "./LiveCursorOverlay";
import {
  buildLiveViewState,
  LIVE_VIEW_CHANNEL_NAME,
  LIVE_VIEW_HEARTBEAT_MS,
  mergeLiveViews,
  pruneLiveViews,
  shouldPublishLiveCursor,
  shouldPublishLiveView,
  type LiveCursorPublishMark,
  type LiveViewState,
} from "./live-view-sync-model";
import {
  createFollowSession,
  deriveObserveEligibility,
  followViewportFromLiveView,
  OBSERVE_FOLLOW_SYNC_STEP,
  observerInteracted,
  receiveTargetViewport,
  resumeFollow,
  startFollow,
  stopFollow,
  syncObserverViewport,
  targetBlockedObserve,
  type FollowSession,
} from "./observe-follow-model";
import { CompareReviewRoom, buildCompareSeedPoolFromProcesses } from "./CompareReviewRoom";
import type { ComparePinGateSummary, ComparePoolItem } from "./compare-review-model";
import {
  compareSendInboxToPoolItems,
  consumeCompareSendInbox,
} from "./compare-send-inbox";
import { ManuscriptPinFeedbackBridge } from "./ManuscriptPinFeedback";
import { usePinTaskWorkspaceSync } from "./use-pin-task-workspace-sync";
import { ProcessCompareViewer } from "./ProcessCompareViewer";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import { ProductionPagePresence } from "./ProductionPagePresence";
import { uploadProductionVoiceCommentary } from "./production-voice-commentary-api";
import { useServerPresenceSync } from "./use-server-presence-sync";
import { ReviewSessionBar } from "./ReviewSessionBar";
import { ReviewVoiceCommentaryPanel, type VoiceViewCapture } from "./ReviewVoiceCommentaryPanel";
import {
  voiceTracksForEpisode,
  type VoiceCommentaryTrack,
  type VoiceViewSnapshot,
} from "./review-voice-commentary-model";
import {
  deriveSessionPresence,
  endReviewSession,
  joinReviewSession,
  leaveReviewSession,
  REVIEW_SESSION_CHANNEL_NAME,
  setSessionAttention,
  startReviewSession,
  type ReviewSession,
} from "./review-session-model";
import {
  acquirePageEditLock,
  canEditPage,
  derivePageEditLock,
  heartbeatPagePresence,
  leavePagePresence,
  mergePagePresence,
  PAGE_PRESENCE_CHANNEL_NAME,
  PAGE_PRESENCE_HEARTBEAT_MS,
  releasePageEditLock,
  type PagePresenceActor,
  type PagePresenceEntry,
} from "./page-edit-lock-model";
import {
  countOpenPins,
  countOpenUrgentPins,
  createEpisodeSampleCompareItems,
  createEpisodeSampleComments,
  deriveEpisodeApprovalGate,
  EPISODE_SAMPLE_PAGE,
  episodeRoomAssigneeOptions,
  resolveEpisodeApprover,
} from "./production-episode-room-model";
import { reviewLaneLabel } from "./production-labels";
import { productionSurfacePath } from "./production-project-surfaces";
import { ProductionPill, ProductionSampleBadge } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type RoomTab = "viewer" | "compare";

export interface ProductionEpisodeReviewRoomProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string;
  readonly isDemo: boolean;
  readonly canEdit: boolean;
  readonly roleLens: CreatorRoleLens;
  /** 로그인 사용자와 연결된 참여 배정. 실제 프로젝트에서 승인 주체를 정한다. */
  readonly viewerAssignmentId: string | null;
  readonly onApproveLane: (lane: ReviewLane, assignmentId: string) => Promise<void>;
  /**
   * 실제 프로젝트의 공정·리비전 실데이터 (페이지가 원고·버전 로드 패턴으로 채운다).
   * 없으면 비교 탭은 빈 풀로 시작한다 — 외부 이미지 추가만으로도 비교가 된다.
   */
  readonly compareProcesses?: readonly ProductionManuscriptProcess[];
  /** 리비전 렌더 URL 해석기(프리뷰 서명 URL 맵). 없으면 플레이스홀더 아트 관습을 따른다. */
  readonly resolveCompareImageUrl?: (processId: string, revisionId: string) => string | null;
  /** 지난 회차 페이지 풀 항목 (페이지가 앞 회차 공정 head 리비전으로 매핑해 넘긴다). */
  readonly previousEpisodePages?: readonly ComparePoolItem[];
  /** 페이지의 비교 데이터 로드 상태. 비교 탭의 로딩·에러 배너를 가른다. */
  readonly compareLoadState?: "idle" | "loading" | "ready" | "error";
}

/**
 * 회차 룸의 중심: 원고 위에 핀 코멘트를 달고, 공정 버전을 비교하고,
 * 필수 수정이 남아 있으면 승인을 잠그는 흐름을 한 화면에서 보여 준다.
 */
export function ProductionEpisodeReviewRoom({
  aggregate,
  episodeId,
  isDemo,
  canEdit,
  roleLens,
  viewerAssignmentId,
  onApproveLane,
  compareProcesses,
  resolveCompareImageUrl,
  previousEpisodePages,
  compareLoadState = "idle",
}: ProductionEpisodeReviewRoomProps) {
  const bt = useBilingual("ProductionEpisodeReviewRoom");
  // 보기 탭은 주소에 남겨 링크로 공유하거나 새로고침해도 같은 화면을 연다.
  const [params, setParams] = useSearchParams();
  const tab: RoomTab = params.get("roomView") === "compare" ? "compare" : "viewer";
  const setTab = useCallback((next: RoomTab) => setParams((previous) => {
    const updated = new URLSearchParams(previous);
    if (next === "compare") updated.set("roomView", "compare");
    else updated.delete("roomView");
    return updated;
  }, { replace: true }), [setParams]);
  const [comments, setComments] = useState<StudioCommentsDocument | null>(() =>
    isDemo ? createEpisodeSampleComments(aggregate, new Date()) : null);
  const [approving, setApproving] = useState(false);
  const compareItems = useMemo(
    () => isDemo
      ? createEpisodeSampleCompareItems(new Date(), {
        storyboard: bt("콘티", "Storyboard"),
        lineArt: bt("선화·명암", "Line & tone"),
        color: bt("채색", "Color"),
      })
      : [],
    [bt, isDemo],
  );
  const approver = resolveEpisodeApprover(aggregate, episodeId, { isDemo, roleLens, viewerAssignmentId });
  const assigneeOptions = useMemo(() => episodeRoomAssigneeOptions(aggregate, bt), [aggregate, bt]);

  // 비교 검수(CompareReviewRoom) 전용 댓글 문서. 원고 핀 문서와 분리해 소유하고,
  // 회차 키로 이 기기에 저장한다(서버 저장 이관은 원고 핀 문서와 같은 패턴의 후속 작업).
  const compareCommentsKey = `toonstudio.compare-comments.${episodeId}`;
  const [compareComments, setCompareComments] = useState<StudioCommentsDocument>(() => {
    if (isDemo || typeof window === "undefined") return createEmptyStudioCommentsDocument();
    try {
      const raw = window.localStorage.getItem(compareCommentsKey);
      return raw ? normalizeStudioCommentsDocument(raw) : createEmptyStudioCommentsDocument();
    } catch {
      return createEmptyStudioCommentsDocument();
    }
  });
  useEffect(() => {
    if (isDemo || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(compareCommentsKey, serializeStudioCommentsDocument(compareComments));
    } catch { /* 저장 실패 시 이 세션 안에서만 유지한다 */ }
  }, [compareComments, compareCommentsKey, isDemo]);
  const [comparePinGate, setComparePinGate] = useState<ComparePinGateSummary | null>(null);
  const handleComparePinGateChange = useCallback((summary: ComparePinGateSummary) => {
    setComparePinGate((previous) => (previous
      && previous.openCount === summary.openCount
      && previous.urgentOpenCount === summary.urgentOpenCount
      && previous.urgentSourceLabels.join("\n") === summary.urgentSourceLabels.join("\n"))
      ? previous
      : summary);
  }, []);
  // 에디터 "비교로 보내기" 수신함: 마운트 때 한 번 소비해 풀 씨앗에 합친다(중복 방지 위해 비운다).
  const [sentCompareItems] = useState<readonly ComparePoolItem[]>(() => {
    if (isDemo || typeof window === "undefined") return [];
    try {
      return compareSendInboxToPoolItems(consumeCompareSendInbox(window.localStorage, aggregate.workId), aggregate.workId);
    } catch {
      return [];
    }
  });
  const compareActor = approver?.actor ?? { displayName: bt("나", "Me") };
  const compareActorId = approver?.assignmentId ?? viewerAssignmentId ?? "me";
  const compareSeedItems = useMemo<readonly ComparePoolItem[]>(
    () => isDemo
      ? []
      : [...buildCompareSeedPoolFromProcesses(
        compareProcesses ?? [],
        resolveCompareImageUrl,
        compareActorId,
      ), ...sentCompareItems],
    [isDemo, compareProcesses, resolveCompareImageUrl, compareActorId, sentCompareItems],
  );
  const storyboardProcessId = useMemo(
    () => compareProcesses?.find((process) => process.artifact.kind === "storyboard")?.artifact.id ?? null,
    [compareProcesses],
  );

  // 페이지 단위 편집 잠금 + 프레즌스: 이 페이지를 열고 있는 사람과 편집자를 표시하고,
  // 다른 사람이 편집 중이면 내 핀 변경을 적용하지 않아 동시 편집 충돌을 막는다.
  // 같은 브라우저의 다른 탭과는 BroadcastChannel로, 그 외에는 이 탭 안에서만 동기화된다.
  const pageId = EPISODE_SAMPLE_PAGE.pageId;
  const selfActorId = approver?.assignmentId ?? viewerAssignmentId ?? null;
  const selfActorName = approver?.actor.displayName ?? bt("나", "Me");
  const demoViewerActors = useMemo<readonly PagePresenceActor[]>(() => isDemo
    ? assigneeOptions
      .filter((option) => option.id !== selfActorId)
      .slice(0, 2)
      .map((option) => ({ pageId, actorId: option.id, displayName: option.displayName }))
    : [], [assigneeOptions, isDemo, pageId, selfActorId]);
  const [presence, setPresence] = useState<readonly PagePresenceEntry[]>(() => {
    const now = new Date();
    let entries: readonly PagePresenceEntry[] = demoViewerActors.map((viewer) => ({
      ...viewer,
      mode: "viewing" as const,
      heartbeatAt: now.toISOString(),
    }));
    // 진입 시 잠금이 비어 있으면 내가 먼저 잡는다 — 기존 흐름에 단계를 더하지 않기 위해서다.
    if (selfActorId) {
      entries = acquirePageEditLock(entries, { pageId, actorId: selfActorId, displayName: selfActorName }, now).entries;
    }
    return entries;
  });
  const presenceRef = useRef(presence);
  const presenceChannelRef = useRef<BroadcastChannel | null>(null);
  const publishPresence = useCallback((entries: readonly PagePresenceEntry[], leavingActorId?: string) => {
    try {
      presenceChannelRef.current?.postMessage({ pageId, entries, leavingActorId });
    } catch { /* 채널 실패는 이 탭 안 프레즌스로 계속 동작한다. */ }
  }, [pageId]);

  useEffect(() => {
    presenceRef.current = presence;
  }, [presence]);

  // 떠날 때 알리는 정리 효과는 채널 정리보다 먼저 실행되어야 해서 채널 효과보다 위에 둔다.
  useEffect(() => () => {
    if (!selfActorId) return;
    publishPresence(leavePagePresence(presenceRef.current, pageId, selfActorId), selfActorId);
  }, [pageId, selfActorId, publishPresence]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(PAGE_PRESENCE_CHANNEL_NAME);
    presenceChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { pageId?: unknown; entries?: unknown; leavingActorId?: unknown } | null;
      if (!data || data.pageId !== pageId) return;
      if (typeof data.leavingActorId === "string") {
        setPresence((previous) => leavePagePresence(previous, pageId, data.leavingActorId as string));
        return;
      }
      if (!Array.isArray(data.entries)) return;
      const incoming = (data.entries as PagePresenceEntry[]).filter((entry) =>
        entry && entry.pageId === pageId && typeof entry.actorId === "string"
        && typeof entry.displayName === "string" && typeof entry.heartbeatAt === "string"
        && (entry.mode === "editing" || entry.mode === "viewing"));
      if (!incoming.length) return;
      setPresence((previous) => mergePagePresence(previous, incoming, new Date()));
    };
    publishPresence(presenceRef.current);
    return () => {
      channel.close();
      presenceChannelRef.current = null;
    };
  }, [pageId, publishPresence]);

  useEffect(() => {
    if (!selfActorId) return;
    const tick = () => {
      let next = heartbeatPagePresence(
        presenceRef.current,
        { pageId, actorId: selfActorId, displayName: selfActorName },
        new Date(),
      );
      // 샘플에서는 시뮬레이션된 동료도 계속 페이지를 보고 있는 것으로 유지한다.
      for (const viewer of demoViewerActors) {
        next = heartbeatPagePresence(next, viewer, new Date());
      }
      presenceRef.current = next;
      setPresence(next);
      publishPresence(next);
    };
    const timer = setInterval(tick, PAGE_PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [pageId, selfActorId, selfActorName, demoViewerActors, publishPresence]);

  const pageLock = derivePageEditLock(presence, pageId, new Date());
  const handleAcquirePageLock = useCallback(() => {
    if (!selfActorId) return;
    const result = acquirePageEditLock(
      presenceRef.current,
      { pageId, actorId: selfActorId, displayName: selfActorName },
      new Date(),
    );
    presenceRef.current = result.entries;
    setPresence(result.entries);
    publishPresence(result.entries);
  }, [pageId, selfActorId, selfActorName, publishPresence]);
  const handleReleasePageLock = useCallback(() => {
    if (!selfActorId) return;
    const next = releasePageEditLock(presenceRef.current, pageId, selfActorId, new Date());
    presenceRef.current = next;
    setPresence(next);
    publishPresence(next);
  }, [pageId, selfActorId, publishPresence]);
  /** 다른 사람이 페이지 잠금을 잡고 있으면 핀 변경을 적용하지 않는다(충돌 방지). 신원이 없는 로컬 열람은 기존 동작을 유지한다. */
  const handleCommentsChange = useCallback((next: StudioCommentsDocument) => {
    if (selfActorId && !canEditPage(presenceRef.current, pageId, selfActorId, new Date()).allowed) return;
    setComments(next);
  }, [pageId, selfActorId]);

  // 검수 핀 → 할 일 동기화: 핀 생성·해결·재열림·삭제·담당 변경은 전부
  // handleCommentsChange 한 곳을 지나 setComments로만 반영되므로, 문서가
  // 바뀔 때마다 동기화하면 모든 이벤트가 빠짐없이 할 일에 닿는다.
  // 진입 시 1회 실행으로 동기화 이전에 만들어진 핀도 소급 등록된다.
  // 잠금에 막힌 변경은 setComments에 닿지 않아 동기화도 일어나지 않는다.
  const { syncPinTasksFromDocument } = usePinTaskWorkspaceSync({ aggregate, isDemo, episodeId });
  useEffect(() => {
    if (!comments) return;
    void syncPinTasksFromDocument(comments);
  }, [comments, syncPinTasksFromDocument]);

  // 라이브 커서·보기 동기화: 누가 이 페이지의 어디를 보고 있는지를 커서로 보여 주고,
  // 원하면 상대가 보는 화면 그대로 따라간다(관찰 모드). 커서는 휘발성이라 프레즌스보다
  // 짧은 하트비트로 유지한다. 관찰 상태 기계는 observe-follow-model이 정본이다:
  // 직접 스크롤·조작하면 해제가 아니라 일시정지(paused-manual)로 남고, 대상이
  // "따라오기 차단"을 켜면 즉시 blocked로 해제된다.
  const [liveViews, setLiveViews] = useState<readonly LiveViewState[] | null>(null);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [followSession, setFollowSession] = useState<FollowSession | null>(null);
  const [observeBlockerIds, setObserveBlockerIds] = useState<readonly string[]>([]);
  const [selfObserveBlocked, setSelfObserveBlocked] = useState(false);
  const liveViewsRef = useRef<readonly LiveViewState[]>([]);
  const ownLiveRef = useRef<LiveViewState | null>(null);
  const lastCursorMarkRef = useRef<LiveCursorPublishMark | null>(null);
  const liveChannelRef = useRef<BroadcastChannel | null>(null);
  const viewerWrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const followSessionRef = useRef<FollowSession | null>(null);
  const observeBlockersRef = useRef<ReadonlySet<string>>(new Set());
  const selfObserveBlockedRef = useRef(false);
  const applyFollowSession = useCallback((next: FollowSession | null) => {
    followSessionRef.current = next;
    setFollowSession(next);
  }, []);
  /** 대상의 차단 신호 수신: 내 대상이 차단하면 그 자리에서 blocked로 해제한다. */
  const noteObserveBlock = useCallback((actorId: string, blocked: boolean) => {
    const next = new Set(observeBlockersRef.current);
    if (blocked) next.add(actorId);
    else next.delete(actorId);
    observeBlockersRef.current = next;
    setObserveBlockerIds([...next]);
    const session = followSessionRef.current;
    if (blocked && session && session.targetUserId === actorId && session.state !== "off") {
      applyFollowSession(targetBlockedObserve(session));
    }
  }, [applyFollowSession]);
  const publishObserveBlock = useCallback((blocked: boolean) => {
    if (!selfActorId) return;
    try {
      liveChannelRef.current?.postMessage({ pageId, observeBlock: { actorId: selfActorId, blocked } });
    } catch { /* 채널 실패는 이 탭 동작으로 계속된다. */ }
  }, [pageId, selfActorId]);
  const handleToggleSelfObserveBlocked = useCallback(() => {
    const next = !selfObserveBlockedRef.current;
    selfObserveBlockedRef.current = next;
    setSelfObserveBlocked(next);
    publishObserveBlock(next);
  }, [publishObserveBlock]);

  const publishLiveView = useCallback((view: LiveViewState) => {
    ownLiveRef.current = view;
    try {
      liveChannelRef.current?.postMessage({ pageId, view });
    } catch { /* 채널 실패는 이 탭 표시만으로 계속 동작한다. */ }
    setLiveViews((previous) => {
      const next = mergeLiveViews(previous ?? [], [view], new Date());
      liveViewsRef.current = next;
      return next;
    });
  }, [pageId]);

  // 검수 세션: 프레즌스 신호(커서·위치)는 세션 안에서만 흐른다. 세션 상태는
  // 페이지 프레즌스와 같은 방식으로 탭 사이에 공유하고, 세션이 없거나 내가
  // 참여하지 않았거나 집중 모드이면 커서 발행·표시를 모델 정책대로 막는다.
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const reviewSessionRef = useRef<ReviewSession | null>(null);
  const sessionChannelRef = useRef<BroadcastChannel | null>(null);
  const publishSession = useCallback((session: ReviewSession | null) => {
    reviewSessionRef.current = session;
    setReviewSession(session);
    try {
      sessionChannelRef.current?.postMessage({ episodeId, session });
    } catch { /* 채널 실패는 이 탭 세션으로 계속 동작한다. */ }
  }, [episodeId]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(REVIEW_SESSION_CHANNEL_NAME);
    sessionChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { episodeId?: unknown; session?: unknown } | null;
      if (!data || data.episodeId !== episodeId) return;
      const incoming = data.session as ReviewSession | null;
      if (incoming !== null && (typeof incoming !== "object" || typeof incoming.id !== "string"
        || typeof incoming.hostActorId !== "string" || !Array.isArray(incoming.participants))) return;
      // 더 최근에 시작했거나 결정이 더 쌓인 쪽을 이긴 것으로 본다 (단순·결정적 규칙).
      const current = reviewSessionRef.current;
      if (current && incoming
        && (incoming.startedAt < current.startedAt
          || (incoming.startedAt === current.startedAt && incoming.decisions.length < current.decisions.length))) return;
      reviewSessionRef.current = incoming;
      setReviewSession(incoming);
    };
    return () => {
      channel.close();
      sessionChannelRef.current = null;
    };
  }, [episodeId]);

  const sessionPresence = deriveSessionPresence(reviewSession, selfActorId, liveNow);
  const handleStartSession = useCallback(() => {
    if (!selfActorId) return;
    publishSession(startReviewSession({
      id: `session:${episodeId}:${Date.now()}`,
      scopeId: episodeId,
      host: { actorId: selfActorId, displayName: selfActorName },
      now: new Date(),
    }));
  }, [episodeId, selfActorId, selfActorName, publishSession]);
  const handleJoinSession = useCallback(() => {
    if (!selfActorId || !reviewSessionRef.current) return;
    publishSession(joinReviewSession(reviewSessionRef.current, { actorId: selfActorId, displayName: selfActorName }, new Date()));
  }, [selfActorId, selfActorName, publishSession]);
  const handleLeaveSession = useCallback(() => {
    if (!selfActorId || !reviewSessionRef.current) return;
    publishSession(leaveReviewSession(reviewSessionRef.current, selfActorId, new Date()));
  }, [selfActorId, publishSession]);
  const handleToggleFocus = useCallback(() => {
    if (!selfActorId || !reviewSessionRef.current) return;
    const mine = reviewSessionRef.current.participants.find((p) => p.actorId === selfActorId);
    if (!mine) return;
    publishSession(setSessionAttention(
      reviewSessionRef.current,
      selfActorId,
      mine.attention === "focus" ? "participating" : "focus",
    ));
  }, [selfActorId, publishSession]);
  const handleEndSession = useCallback(() => {
    if (!selfActorId || !reviewSessionRef.current) return;
    publishSession(endReviewSession(reviewSessionRef.current, selfActorId, new Date()));
  }, [selfActorId, publishSession]);

  // 서버 전송 계층: 실제 프로젝트에서는 프레즌스·라이브 뷰·세션을 서버 하트비트로
  // 기기 간에 주고받는다. UI·로컬 상태 구조는 그대로이고, 합류는 로컬 모델의
  // merge 규칙으로만 일어난다. 데모·미로그인에서는 꺼져 탭 간 동기화만 동작한다.
  useServerPresenceSync({
    enabled: !isDemo && Boolean(selfActorId),
    projectId: aggregate.projectId,
    episodeId,
    pageId,
    bridge: {
      readLocal: () => ({
        presence: presenceRef.current,
        liveViews: liveViewsRef.current,
        ownLiveView: ownLiveRef.current,
        session: reviewSessionRef.current,
      }),
      applyMerged: (next) => {
        presenceRef.current = next.presence;
        setPresence(next.presence);
        liveViewsRef.current = next.liveViews;
        setLiveViews(next.liveViews);
        if (next.session !== reviewSessionRef.current) {
          reviewSessionRef.current = next.session;
          setReviewSession(next.session);
        }
      },
    },
  });

  // ── 비동기 검수 해설(음성 해설) 호스트 배선 ─────────────────────────────
  // 패널(ReviewVoiceCommentaryPanel)은 콜백 계약만 아는 순수 표면이라, 실제
  // 탭·뷰포트·핀 상태는 이 룸이 소유하고 어댑터를 여기서 만든다.
  // - captureView: 현재 탭 + 룸 패널 스크롤(정규화 0..1) + 열린 핀 스레드를
  //   VoiceViewSnapshot으로 변환한다. 원고 뷰어·비교 뷰어 내부의 줌/팬 상태는
  //   각 뷰어가 자체 소유해 호스트가 읽을 수 없으므로 scale은 1로 기록한다.
  // - onApplyView: 표면에 맞는 탭으로 전환하고, 원고 표면이면 기록된 스크롤을
  //   룸 패널에 적용하며, 큐가 가리키는 핀을 아래 요약 목록으로 하이라이트한다.
  //   비교 뷰어(ProcessCompareViewer)의 페인·뷰포트는 내부 상태라 호스트에서
  //   강제 적용할 수 없어, 비교 표면 적용은 탭 전환+핀 하이라이트까지가 범위다.
  // - onSaveTrack(저장): 실제 프로젝트에서는 제작 모듈의 회차 음성 해설
  //   엔드포인트(POST /production/projects/:projectId/episodes/:episodeId/
  //   voice-commentaries)로 업로드해 서버 저장 트랙으로 교체한다. 검수 음성
  //   노트 API는 project-graph 식별자·전사를 필수로 요구해 이 룸에서는 쓸 수
  //   없어, 같은 운영 정책(5MB·보유 기본 14일/최대 30일·서명 읽기)을 따르는
  //   전용 경로를 둔다. 데모이거나 업로드가 실패하면 패널이 만든 blob 참조
  //   트랙을 세션 상태에 그대로 보관한다 — 이 탭 안에서만 미리듣기가 되고
  //   새로고침하면 사라지며, 모델의 parse가 blob 오디오를 복원 대상에서
  //   제외하는 정책과 같은 한계다.
  const [voiceTracks, setVoiceTracks] = useState<readonly VoiceCommentaryTrack[]>([]);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voicePinIds, setVoicePinIds] = useState<readonly string[]>([]);
  // 패널은 녹화 중 500ms 간격으로 captureView를 부른다. 콜백 정체성이 매
  // 렌더마다 바뀌면 샘플링 타이머가 계속 리셋되므로, 최신 상태는 ref로 읽는다.
  const voiceCaptureRef = useRef({ tab, comments, compareItems });
  useEffect(() => {
    voiceCaptureRef.current = { tab, comments, compareItems };
  }, [tab, comments, compareItems]);

  const captureVoiceView = useCallback((): VoiceViewCapture | null => {
    const current = voiceCaptureRef.current;
    const panel = panelRef.current;
    const maxX = panel ? Math.max(1, panel.scrollWidth - panel.clientWidth) : 1;
    const maxY = panel ? Math.max(1, panel.scrollHeight - panel.clientHeight) : 1;
    const tx = panel ? Math.min(1, Math.max(0, panel.scrollLeft / maxX)) : 0;
    const ty = panel ? Math.min(1, Math.max(0, panel.scrollTop / maxY)) : 0;
    const doc = current.comments;
    if (current.tab === "compare") {
      return {
        view: {
          surface: "compare",
          poolItemId: current.compareItems[0]?.id ?? null,
          pageId: null,
          mode: null,
          scale: 1,
          tx,
          ty,
        },
        pinThreadIds: doc
          ? doc.threads.filter((thread) => thread.anchor.type === "compare-image" && !thread.resolved).map((thread) => thread.id)
          : [],
      };
    }
    return {
      view: { surface: "manuscript", poolItemId: null, pageId, mode: null, scale: 1, tx, ty },
      pinThreadIds: doc
        ? doc.threads
          .filter((thread) => thread.anchor.type === "point" && thread.anchor.pageId === pageId && !thread.resolved)
          .map((thread) => thread.id)
        : [],
    };
  }, [pageId]);

  const applyVoiceView = useCallback((view: VoiceViewSnapshot, pinThreadIds: readonly string[]) => {
    setVoicePinIds(pinThreadIds);
    if (view.surface === "compare") {
      setTab("compare");
      return;
    }
    setTab("viewer");
    // 탭 전환 렌더 뒤에 스크롤을 적용한다. 프로그래매틱 스크롤로 표시해
    // 팔로우 일시정지(handlePanelScroll)가 걸리지 않게 한다.
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const maxX = Math.max(0, panel.scrollWidth - panel.clientWidth);
      const maxY = Math.max(0, panel.scrollHeight - panel.clientHeight);
      programmaticScrollRef.current = true;
      panel.scrollTo({ left: view.tx * maxX, top: view.ty * maxY });
    });
  }, [setTab]);

  const handleSaveVoiceTrack = useCallback((track: VoiceCommentaryTrack, audioBlob: Blob | null) => {
    // 먼저 세션에 넣어 이 탭에서 바로 재생할 수 있게 하고, 실제 프로젝트면
    // 서버 저장을 이어 시도한다. 성공하면 서버가 재구성한 트랙(kind:"server"
    // 참조 + 서명 URL)으로 교체하고, 실패하면 blob 세션 보관이 폴백으로 남는다.
    setVoiceTracks((previous) => [...previous.filter((kept) => kept.id !== track.id), track]);
    setVoicePanelOpen(true);
    if (!audioBlob || isDemo) return;
    void (async () => {
      try {
        const { view } = await uploadProductionVoiceCommentary({
          projectId: aggregate.projectId,
          episodeId,
          operationId: `episode-voice-commentary:${track.id}`,
          track,
          file: audioBlob,
        });
        setVoiceTracks((previous) => [...previous.filter((kept) => kept.id !== track.id), view.track]);
      } catch {
        // 서버 저장 실패(권한·용량·네트워크) — 세션 보관이 폴백으로 유지된다.
      }
    })();
  }, [aggregate.projectId, episodeId, isDemo]);

  const handleOpenVoicePin = useCallback((threadId: string) => {
    setVoicePinIds([threadId]);
    const thread = voiceCaptureRef.current.comments?.threads.find((candidate) => candidate.id === threadId);
    // 핀 스레드 열기 동선은 기존 탭 구조를 재사용한다: 비교 핀이면 비교 탭,
    // 원고 핀이면 원고 뷰어 탭으로 이동하고, 해당 핀을 아래 요약에 고정한다.
    // (핀 브리지는 외부 선택 API가 없어 스레드 내부 선택까지는 강제하지 않는다.)
    setTab(thread?.anchor.type === "compare-image" ? "compare" : "viewer");
  }, [setTab]);

  const publishOwnLive = useCallback((interacted: boolean) => {
    if (!selfActorId) return;
    // 세션 정책: 세션 참여 중이 아니거나 집중 모드이면 내 위치를 발행하지 않는다.
    if (!deriveSessionPresence(reviewSessionRef.current, selfActorId, new Date()).selfCursorAllowed) return;
    const panel = panelRef.current;
    const maxX = panel ? Math.max(1, panel.scrollWidth - panel.clientWidth) : 1;
    const maxY = panel ? Math.max(1, panel.scrollHeight - panel.clientHeight) : 1;
    const previous = ownLiveRef.current;
    const next = buildLiveViewState({
      actorId: selfActorId,
      displayName: selfActorName,
      pageId,
      cursor: previous?.cursor ?? null,
      scrollX: panel ? panel.scrollLeft / maxX : 0,
      scrollY: panel ? panel.scrollTop / maxY : 0,
      zoom: 1,
      previous,
      interacted,
      now: new Date(),
    });
    publishLiveView(next);
  }, [pageId, selfActorId, selfActorName, publishLiveView]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      setLiveViews([]);
      return;
    }
    const channel = new BroadcastChannel(LIVE_VIEW_CHANNEL_NAME);
    liveChannelRef.current = channel;
    setLiveViews((previous) => previous ?? []);
    // 채널이 열리면 내 차단 상태를 한 번 알린다 (늦게 들어온 탭도 즉시 알게).
    if (selfActorId && selfObserveBlockedRef.current) {
      try {
        channel.postMessage({ pageId, observeBlock: { actorId: selfActorId, blocked: true } });
      } catch { /* 채널 실패는 무시한다. */ }
    }
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { pageId?: unknown; view?: unknown; observeBlock?: unknown } | null;
      if (!data || data.pageId !== pageId) return;
      const block = data.observeBlock as { actorId?: unknown; blocked?: unknown } | undefined;
      if (block && typeof block.actorId === "string" && typeof block.blocked === "boolean") {
        if (block.actorId !== selfActorId) noteObserveBlock(block.actorId, block.blocked);
        return;
      }
      const view = data.view as LiveViewState | null;
      if (!view || typeof view.actorId !== "string" || typeof view.displayName !== "string"
        || typeof view.updatedAt !== "string" || typeof view.interactedAt !== "string") return;
      if (view.actorId === selfActorId) return;
      setLiveViews((previous) => {
        const next = mergeLiveViews(previous ?? [], [view], new Date());
        liveViewsRef.current = next;
        return next;
      });
    };
    return () => {
      channel.close();
      liveChannelRef.current = null;
    };
  }, [pageId, selfActorId, noteObserveBlock]);

  // 하트비트·정리 틱: 내 생존을 알리고, 끊긴 커서를 지우고, 샘플 동료 커서를 움직인다.
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setLiveNow(now);
      publishOwnLive(false);
      setLiveViews((previous) => {
        let next = pruneLiveViews(previous ?? [], now);
        // 샘플에서는 시뮬레이션 동료의 커서가 원고 위를 천천히 오가 검수 장면을 보여 준다.
        const demoViewer = demoViewerActors[0];
        if (isDemo && demoViewer) {
          const t = now.getTime();
          const demoView: LiveViewState = {
            actorId: demoViewer.actorId,
            displayName: demoViewer.displayName,
            pageId,
            cursor: {
              x: 0.5 + 0.32 * Math.sin(t / 2_400),
              y: 0.5 + 0.26 * Math.cos(t / 3_100),
            },
            scrollX: 0,
            scrollY: 0,
            zoom: 1,
            updatedAt: now.toISOString(),
            interactedAt: now.toISOString(),
          };
          next = mergeLiveViews(next, [demoView], now);
        }
        liveViewsRef.current = next;
        return next;
      });
    };
    const timer = setInterval(tick, LIVE_VIEW_HEARTBEAT_MS / 10);
    return () => clearInterval(timer);
  }, [demoViewerActors, isDemo, pageId, publishOwnLive]);

  /**
   * 관찰 일시정지: 내가 직접 만지는 순간 따라가기는 "끝나지" 않고 일시정지로 남는다.
   * 대상 정보가 세션에 남아 있어 "다시 따라가기" 한 번으로 복귀할 수 있다.
   */
  const pauseFollowByHand = useCallback(() => {
    const session = followSessionRef.current;
    if (!session) return;
    const next = observerInteracted(session);
    if (next !== session) applyFollowSession(next);
  }, [applyFollowSession]);

  const handleViewerPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!selfActorId) return;
    if (!deriveSessionPresence(reviewSessionRef.current, selfActorId, new Date()).selfCursorAllowed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const cursor = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
    const nowMs = Date.now();
    if (!shouldPublishLiveCursor(lastCursorMarkRef.current, cursor, nowMs)) return;
    lastCursorMarkRef.current = { atMs: nowMs, cursor };
    const previous = ownLiveRef.current;
    publishLiveView(buildLiveViewState({
      actorId: selfActorId,
      displayName: selfActorName,
      pageId,
      cursor,
      scrollX: previous?.scrollX ?? 0,
      scrollY: previous?.scrollY ?? 0,
      zoom: 1,
      previous,
      interacted: true,
      now: new Date(),
    }));
  }, [pageId, selfActorId, selfActorName, publishLiveView]);

  const handleViewerPointerLeave = useCallback(() => {
    if (!selfActorId) return;
    lastCursorMarkRef.current = { atMs: Date.now(), cursor: null };
    const previous = ownLiveRef.current;
    publishLiveView(buildLiveViewState({
      actorId: selfActorId,
      displayName: selfActorName,
      pageId,
      cursor: null,
      scrollX: previous?.scrollX ?? 0,
      scrollY: previous?.scrollY ?? 0,
      zoom: 1,
      previous,
      interacted: true,
      now: new Date(),
    }));
  }, [pageId, selfActorId, selfActorName, publishLiveView]);

  const handlePanelScroll = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
    } else {
      pauseFollowByHand();
    }
    if (!selfActorId) return;
    const maxX = Math.max(1, panel.scrollWidth - panel.clientWidth);
    const maxY = Math.max(1, panel.scrollHeight - panel.clientHeight);
    const next = { pageId, scrollX: panel.scrollLeft / maxX, scrollY: panel.scrollTop / maxY, zoom: 1 };
    const previous = ownLiveRef.current;
    if (!shouldPublishLiveView(previous, next)) return;
    publishLiveView(buildLiveViewState({
      actorId: selfActorId,
      displayName: selfActorName,
      ...next,
      cursor: previous?.cursor ?? null,
      previous,
      interacted: true,
      now: new Date(),
    }));
  }, [pageId, selfActorId, selfActorName, publishLiveView, pauseFollowByHand]);

  /** 관찰 시작: 자격 판정(프레즌스·세션 노출·집중·차단)을 통과해야 following이 된다. */
  const handleFollowStart = useCallback((actorId: string) => {
    if (!selfActorId) return;
    const presenceNow = deriveSessionPresence(reviewSessionRef.current, selfActorId, new Date());
    const participant = presenceNow.participants.find((p) => p.actorId === actorId);
    const target = pruneLiveViews(liveViewsRef.current, new Date())
      .find((view) => view.actorId === actorId);
    const eligibility = deriveObserveEligibility({
      targetPresent: Boolean(target),
      sessionVisible: presenceNow.visible,
      targetCursorsVisible: participant?.cursorsVisible ?? false,
      targetBlocked: observeBlockersRef.current.has(actorId),
    });
    let session = startFollow(createFollowSession(selfActorId, actorId), {
      targetAllowsObserve: eligibility.allowed,
    });
    if (target) session = receiveTargetViewport(session, followViewportFromLiveView(target));
    applyFollowSession(session);
  }, [selfActorId, applyFollowSession]);

  const handleFollowStop = useCallback(() => {
    const session = followSessionRef.current;
    if (session) applyFollowSession(stopFollow(session));
  }, [applyFollowSession]);

  const handleFollowResume = useCallback(() => {
    const session = followSessionRef.current;
    if (session) applyFollowSession(resumeFollow(session));
  }, [applyFollowSession]);

  // 관찰 적용: following일 때만 대상의 페이지·스크롤·줌을 따라간다.
  // - 대상이 차단했으면 즉시 blocked (채널 수신이 먼저 처리하지만 여기서도 보장한다).
  // - 세션이 닫혔거나 대상이 집중 모드로 위치 신호를 숨기면 그에 맞게 전이한다.
  // - 대상이 사라졌으면 off로 해제한다. 첫 동기화 전(liveViews=null)에는 판단하지 않는다.
  // - 대상이 다른 페이지에 있으면 뷰포트만 기록하고 스크롤은 건드리지 않는다
  //   (이 룸은 단일 페이지 표면 — 페이지 이동 자체는 다페이지 뷰어의 몫, NOTES 참조).
  useEffect(() => {
    const session = followSession;
    if (!session || session.state !== "following" || !selfActorId) return;
    if (observeBlockersRef.current.has(session.targetUserId)) {
      applyFollowSession(targetBlockedObserve(session));
      return;
    }
    const presenceNow = deriveSessionPresence(reviewSessionRef.current, selfActorId, liveNow);
    if (!presenceNow.visible) {
      applyFollowSession(stopFollow(session));
      return;
    }
    const participant = presenceNow.participants.find((p) => p.actorId === session.targetUserId);
    if (participant && !participant.cursorsVisible) {
      applyFollowSession(targetBlockedObserve(session));
      return;
    }
    if (liveViews === null) return;
    const target = pruneLiveViews(liveViews, liveNow).find((view) => view.actorId === session.targetUserId);
    if (!target) {
      applyFollowSession(stopFollow(session));
      return;
    }
    const targetViewport = followViewportFromLiveView(target);
    const recorded = receiveTargetViewport(session, targetViewport);
    if (recorded !== session) applyFollowSession(recorded);
    if (targetViewport.pageId !== pageId) return;
    const panel = panelRef.current;
    if (!panel) return;
    const maxX = Math.max(0, panel.scrollWidth - panel.clientWidth);
    const maxY = Math.max(0, panel.scrollHeight - panel.clientHeight);
    const synced = syncObserverViewport(
      {
        pageId,
        scrollX: maxX > 0 ? panel.scrollLeft / maxX : 0,
        scrollY: maxY > 0 ? panel.scrollTop / maxY : 0,
        zoom: 1,
      },
      targetViewport,
      OBSERVE_FOLLOW_SYNC_STEP,
    );
    const left = synced.scrollX * maxX;
    const top = synced.scrollY * maxY;
    if (Math.abs(panel.scrollLeft - left) < 2 && Math.abs(panel.scrollTop - top) < 2) return;
    programmaticScrollRef.current = true;
    panel.scrollTo({ left, top });
  }, [followSession, liveViews, liveNow, pageId, selfActorId, applyFollowSession]);

  // 오버레이 칩용 사람별 팔로우 가능 여부 — 시작 핸들러와 같은 판정 함수를 쓴다.
  const observeAllowedByActorId: Record<string, boolean> = {};
  for (const participant of sessionPresence.participants) {
    observeAllowedByActorId[participant.actorId] = deriveObserveEligibility({
      targetPresent: (liveViews ?? []).some((view) => view.actorId === participant.actorId),
      sessionVisible: sessionPresence.visible,
      targetCursorsVisible: participant.cursorsVisible,
      targetBlocked: observeBlockerIds.includes(participant.actorId),
    }).allowed;
  }
  const gate = deriveEpisodeApprovalGate(aggregate, episodeId);
  const myLane = approver?.lane ?? null;
  const myLaneState = myLane ? gate.lanes.find((lane) => lane.lane === myLane) ?? null : null;
  const urgentOpen = comments ? countOpenUrgentPins(comments, EPISODE_SAMPLE_PAGE.pageId) : 0;
  const openPins = comments ? countOpenPins(comments, EPISODE_SAMPLE_PAGE.pageId) : 0;
  // 비교 핀 게이트 합산: 비교 탭이 한 번이라도 열려 집계가 도착하면, 비교 이미지 위의
  // 긴급 미해결 핀도 원고 핀과 같은 규칙으로 승인을 잠근다.
  const compareUrgentOpen = comparePinGate?.urgentOpenCount ?? 0;
  const compareOpenPins = comparePinGate?.openCount ?? 0;
  const manuscriptsHref = productionSurfacePath(aggregate.projectId, "manuscripts", `episode=${encodeURIComponent(episodeId)}&manuscriptView=feedback`);
  const lockReason = !canEdit
    ? bt("편집 권한이 있어야 승인할 수 있습니다.", "You need edit access to approve.")
    : !approver || !myLaneState
      ? isDemo
        ? bt("이 회차 검수 정책에 선택한 역할의 승인 항목이 없습니다.", "The selected role has no approval lane in this review policy.")
        : bt("이 회차에서 내 계정이 승인할 항목이 없습니다.", "Your account has no approval lane in this episode.")
      : myLaneState.approved
        ? bt("내 역할의 승인이 이미 기록되었습니다.", "Your approval is already recorded.")
        : urgentOpen + compareUrgentOpen > 0
            ? bt(
              `필수 수정 핀 ${urgentOpen + compareUrgentOpen}개${compareUrgentOpen > 0 ? ` (원고 ${urgentOpen} · 비교 ${compareUrgentOpen}${comparePinGate?.urgentSourceLabels.length ? ` · ${comparePinGate.urgentSourceLabels.join(", ")}` : ""})` : ""}를 먼저 해결해야 승인할 수 있습니다.`,
              `Resolve ${urgentOpen + compareUrgentOpen} required-fix pins${compareUrgentOpen > 0 ? ` (page ${urgentOpen} · compare ${compareUrgentOpen})` : ""} before approving.`,
            )
            : null;

  const episodeVoiceTracks = voiceTracksForEpisode(voiceTracks, episodeId);
  const voicePinSummaries = voicePinIds.flatMap((threadId) => {
    const thread = comments?.threads.find((candidate) => candidate.id === threadId);
    return thread ? [{ id: thread.id, body: thread.body, resolved: thread.resolved }] : [];
  });

  const approve = async () => {
    if (lockReason || !approver || approving) return;
    setApproving(true);
    try {
      await onApproveLane(approver.lane, approver.assignmentId);
    } finally {
      setApproving(false);
    }
  };

  return (
    <section
      aria-labelledby="episode-review-room-title"
      data-production-episode-review-room="true"
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="episode-review-room-title" className="text-lg font-black tracking-tight text-fg">
              {bt("원고 검수", "Manuscript review")}
            </h2>
            {isDemo ? <ProductionSampleBadge label={bt("예시 원고·코멘트", "Sample pages & comments")} /> : null}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2">
            {bt(
              "원고 위를 눌러 핀을 꽂고 의견을 남기세요. '긴급'으로 표시한 핀은 필수 수정이 되어, 해결될 때까지 내 역할의 승인이 잠깁니다.",
              "Click the page to drop a pin. Pins marked urgent become required fixes and lock your approval until they are resolved.",
            )}
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-panel p-1" role="tablist" aria-label={bt("검수 보기", "Review view")}>
          {([
            ["viewer", MessageSquareMore, bt("원고 뷰어·핀 코멘트", "Viewer & pins")],
            ["compare", Columns2, bt("버전 비교", "Compare versions")],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`episode-review-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`episode-review-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const next: RoomTab = event.key === "Home" ? "viewer" : event.key === "End" ? "compare" : tab === "viewer" ? "compare" : "viewer";
                setTab(next);
                event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#episode-review-tab-${next}`)?.focus();
              }}
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                tab === id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-4">
        <ReviewSessionBar
          session={reviewSession}
          selfActorId={selfActorId}
          canHost={canEdit}
          error={null}
          onStart={handleStartSession}
          onJoin={handleJoinSession}
          onLeave={handleLeaveSession}
          onToggleFocus={handleToggleFocus}
          onEnd={handleEndSession}
          now={liveNow}
        />
      </div>

      <div className="mt-4">
        <ProductionPagePresence
          lock={pageLock}
          selfActorId={selfActorId}
          canAcquire={canEdit}
          onAcquire={handleAcquirePageLock}
          onRelease={handleReleasePageLock}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div
          role="tabpanel"
          id={`episode-review-panel-${tab}`}
          aria-labelledby={`episode-review-tab-${tab}`}
          className="min-w-0"
          ref={panelRef}
          onScroll={handlePanelScroll}
          onWheel={pauseFollowByHand}
        >
          {tab === "viewer" ? (
            comments ? (
              <div
                className="relative"
                ref={viewerWrapRef}
                onPointerMove={handleViewerPointerMove}
                onPointerLeave={handleViewerPointerLeave}
                onPointerDown={pauseFollowByHand}
              >
                <ManuscriptPinFeedbackBridge
                  imageSrc={EPISODE_SAMPLE_PAGE.imageSrc}
                  imageAlt={bt(EPISODE_SAMPLE_PAGE.alt.ko, EPISODE_SAMPLE_PAGE.alt.en)}
                  pageId={EPISODE_SAMPLE_PAGE.pageId}
                  document={comments}
                  onChange={handleCommentsChange}
                  currentActor={approver?.actor ?? { displayName: bt("나", "Me") }}
                  assigneeOptions={assigneeOptions}
                />
                <LiveCursorOverlay
                  views={sessionPresence.visible
                    ? (liveViews ?? []).filter((view) =>
                      sessionPresence.participants.some((p) => p.actorId === view.actorId && p.cursorsVisible))
                    : []}
                  selfActorId={selfActorId}
                  lockHolderActorId={pageLock.holder?.actorId ?? null}
                  followTargetId={followSession?.targetUserId ?? null}
                  followState={followSession?.state ?? "off"}
                  observeAllowedByActorId={observeAllowedByActorId}
                  selfObserveBlocked={selfObserveBlocked}
                  onFollowStart={handleFollowStart}
                  onFollowStop={handleFollowStop}
                  onFollowResume={handleFollowResume}
                  onToggleSelfObserveBlocked={handleToggleSelfObserveBlocked}
                  syncState={typeof BroadcastChannel === "undefined" ? "offline" : "live"}
                  pageId={pageId}
                  now={liveNow}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center">
                <MessageSquareMore className="mx-auto size-7 text-accent" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-fg">{bt("원고와 핀 코멘트는 고정 검수본에서 엽니다", "Pages and pins open from a pinned review")}</p>
                <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-fg-2">
                  {bt(
                    "실제 원고 이미지와 코멘트는 Studio 원고 버전에 고정된 검수본이 기준입니다. 원고·버전의 피드백 탭에서 이 회차 검수본을 선택하세요.",
                    "Real pages and comments come from a review snapshot pinned to a Studio version. Pick this episode's snapshot in the Feedback tab.",
                  )}
                </p>
                <Link className={buttonClass({ size: "sm", className: "mt-4 min-h-11" })} to={manuscriptsHref}>
                  {bt("원고·버전 피드백 열기", "Open manuscript feedback")}
                </Link>
              </div>
            )
          ) : !isDemo ? (
            <div className="space-y-3">
              {compareLoadState === "loading" ? (
                <p className="rounded-2xl border border-line bg-panel p-4 text-xs leading-5 text-fg-2" role="status">
                  {bt("이 회차의 버전을 불러오는 중입니다. 외부 이미지는 지금 바로 추가해 비교할 수 있습니다.", "Loading this episode's versions. You can add an external image and start comparing right away.")}
                </p>
              ) : null}
              {compareLoadState === "error" ? (
                <p className="rounded-2xl border border-bad/30 bg-bad/10 p-4 text-xs leading-5 text-fg" role="alert">
                  {bt("버전을 불러오지 못했습니다. 외부 이미지 비교와 핀은 계속 사용할 수 있고, 버전을 다시 불러오려면 회차 룸을 새로고침하세요.", "Couldn't load versions. External-image compare and pins still work; reload the episode room to retry.")}
                </p>
              ) : null}
              {compareLoadState === "ready" && (compareProcesses?.length ?? 0) === 0 ? (
                <div className="rounded-2xl border border-line bg-panel p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-fg">
                    <Columns2 className="size-4 text-accent" aria-hidden="true" />
                    {bt("불러온 버전이 아직 없습니다 — 외부 이미지부터 비교할 수 있습니다", "No versions loaded yet — start by comparing an external image")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-fg-2">
                    {bt("아래 소스 풀에서 클라이언트 시안 같은 외부 이미지를 추가하면 바로 비교가 시작됩니다. 버전은 Studio 원고의 수정 기록에서 오며, 원고·버전에서 이 회차 버전을 저장하면 여기에 함께 나타납니다.", "Add an external image (such as a client draft) in the source pool below to start comparing right away. Versions come from the Studio history and appear here once saved for this episode.")}
                  </p>
                  <Link className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-11" })} to={productionSurfacePath(aggregate.projectId, "manuscripts", `episode=${encodeURIComponent(episodeId)}&manuscriptView=versions`)}>
                    {bt("원고·버전에서 버전 보기", "See versions in Manuscripts")}
                  </Link>
                </div>
              ) : null}
              <CompareReviewRoom
                episodeId={episodeId}
                seedItems={compareSeedItems}
                storyboardProcessId={storyboardProcessId}
                previousEpisodePages={previousEpisodePages ?? []}
                comments={compareComments}
                onCommentsChange={setCompareComments}
                currentActor={compareActor}
                assigneeOptions={assigneeOptions}
                canEdit={canEdit}
                onPinGateSummaryChange={handleComparePinGateChange}
                manuscriptsHref={manuscriptsHref}
              />
            </div>
          ) : compareItems.length >= 2 ? (
            <ProcessCompareViewer items={compareItems} title={bt("공정 비교", "Process compare")} />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center">
              <Columns2 className="mx-auto size-7 text-accent" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-fg">{bt("비교할 버전을 원고·버전에서 고르세요", "Pick versions to compare in Manuscripts")}</p>
              <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-fg-2">
                {bt("버전은 Studio 원고의 수정 기록에서 옵니다. 과거 버전을 덮어쓰지 않고 새 버전으로 복원합니다.", "Versions come from the Studio history. Restores create a new version instead of overwriting.")}
              </p>
              <Link className={buttonClass({ size: "sm", className: "mt-4 min-h-11" })} to={productionSurfacePath(aggregate.projectId, "manuscripts", `episode=${encodeURIComponent(episodeId)}&manuscriptView=versions`)}>
                {bt("버전 비교 열기", "Open version compare")}
              </Link>
            </div>
          )}
        </div>

        <aside aria-labelledby="episode-approval-gate-title" className="rounded-2xl border border-line bg-panel p-4">
          <h3 id="episode-approval-gate-title" className="flex items-center gap-2 text-sm font-black text-fg">
            <BadgeCheck className="size-4 text-accent" aria-hidden="true" />
            {bt("승인 게이트", "Approval gate")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt("모든 필수 역할이 승인해야 다음 공정과 게시로 넘어갑니다.", "Every required role must approve before the next step or publishing.")}
          </p>
          {gate.lanes.length ? (
            <ul className="mt-3 space-y-2">
              {gate.lanes.map((lane) => (
                <li key={lane.lane} className={cn("flex items-center justify-between gap-2 rounded-xl border px-3 py-2", lane.lane === myLane ? "border-accent/40 bg-accent-soft" : "border-line bg-card")}>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-fg">
                      {reviewLaneLabel(lane.lane, bt)}
                      {lane.lane === myLane ? <span className="ml-1 font-normal text-accent">· {bt("내 역할", "You")}</span> : null}
                    </span>
                    <span className="text-[0.6875rem] text-fg-3">{bt(`${lane.approvals}/${lane.requiredApprovals} 승인`, `${lane.approvals}/${lane.requiredApprovals} approved`)}</span>
                  </span>
                  <ProductionPill tone={lane.approved ? "success" : lane.changeRequested ? "danger" : "warning"}>
                    {lane.approved ? bt("승인", "Approved") : lane.changeRequested ? bt("수정 요청", "Changes") : bt("대기", "Waiting")}
                  </ProductionPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-line p-3 text-xs text-fg-3">
              {bt("이 회차에는 검수 정책이 없습니다. 검수 화면에서 역할별 승인 기준을 정하세요.", "No review policy for this episode yet. Set one in Review.")}
            </p>
          )}

          {comments ? (
            <div className={cn("mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs leading-5", urgentOpen ? "border-bad/35 bg-bad/10 text-fg" : "border-good/35 bg-good/10 text-fg")}>
              {urgentOpen ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" /> : <BadgeCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />}
              <span>
                {urgentOpen
                  ? bt(`필수 수정 핀 ${urgentOpen}개 · 미해결 핀 ${openPins}개`, `${urgentOpen} required fixes · ${openPins} open pins`)
                  : bt(`필수 수정 없음 · 미해결 핀 ${openPins}개`, `No required fixes · ${openPins} open pins`)}
              </span>
            </div>
          ) : null}

          {!isDemo && comparePinGate ? (
            <div className={cn("mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs leading-5", compareUrgentOpen ? "border-bad/35 bg-bad/10 text-fg" : "border-good/35 bg-good/10 text-fg")}>
              {compareUrgentOpen ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" /> : <BadgeCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />}
              <span>
                {compareUrgentOpen
                  ? bt(`비교 필수 수정 핀 ${compareUrgentOpen}개 · 비교 미해결 핀 ${compareOpenPins}개${comparePinGate.urgentSourceLabels.length ? ` · ${comparePinGate.urgentSourceLabels.join(", ")}` : ""}`, `${compareUrgentOpen} compare required fixes · ${compareOpenPins} open compare pins`)
                  : bt(`비교 필수 수정 없음 · 비교 미해결 핀 ${compareOpenPins}개`, `No compare required fixes · ${compareOpenPins} open compare pins`)}
              </span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void approve()}
            disabled={Boolean(lockReason) || approving}
            aria-describedby="episode-approval-lock-reason"
            className={buttonClass({ className: "mt-3 min-h-11 w-full gap-1.5" })}
          >
            {lockReason ? <LockKeyhole className="size-4" aria-hidden="true" /> : <BadgeCheck className="size-4" aria-hidden="true" />}
            {approving
              ? bt("기록 중…", "Recording…")
              : myLane
                ? bt(`${reviewLaneLabel(myLane, bt)} 승인`, `Approve ${reviewLaneLabel(myLane, bt)}`)
                : bt("승인", "Approve")}
          </button>
          <p id="episode-approval-lock-reason" className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-5 text-fg-3" role="status">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {lockReason ?? bt("승인하면 되돌릴 수 없는 결정 기록으로 남습니다.", "Approval is kept as a permanent decision record.")}
          </p>
        </aside>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-black text-fg">
            <Mic className="size-4 text-accent" aria-hidden="true" />
            {bt("음성 해설", "Voice commentary")}
          </h3>
          <button
            type="button"
            aria-expanded={voicePanelOpen}
            onClick={() => setVoicePanelOpen((open) => !open)}
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
          >
            {voicePanelOpen ? bt("해설 닫기", "Close commentary") : bt("해설 열기", "Open commentary")}
          </button>
        </div>
        {voicePanelOpen ? (
          <div className="mt-3">
            <ReviewVoiceCommentaryPanel
              episodeId={episodeId}
              tracks={episodeVoiceTracks}
              authorName={selfActorName}
              authorId={selfActorId}
              readOnly={!canEdit}
              captureView={captureVoiceView}
              onSaveTrack={handleSaveVoiceTrack}
              onApplyView={applyVoiceView}
              onOpenPin={handleOpenVoicePin}
            />
            {voicePinSummaries.length ? (
              <ul aria-live="polite" className="mt-3 space-y-1">
                {voicePinSummaries.map((pin) => (
                  <li key={pin.id} className="flex items-start gap-2 text-xs leading-5 text-fg-2">
                    <MessageSquareMore className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="font-bold text-fg">{pin.resolved ? bt("해결된 핀", "Resolved pin") : bt("해설이 가리키는 핀", "Pin in this commentary")}</span>
                      {" · "}
                      <span className="break-words">{pin.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "화면을 이동하며 말로 남기는 비동기 검수 해설입니다. 해설이 없어도 핀 검수는 종전대로 동작합니다.",
              "Asynchronous voice commentary recorded while moving around the review surface. Pins keep working as before, with or without commentary.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
