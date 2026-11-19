import {
  Activity,
  Gauge,
  LocateFixed,
  MessageCircle,
  SendHorizontal,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { STUDIO_LIVE_CURSOR_CHAT_MAX_LENGTH } from "./studio-live-chat-control";
import {
  StudioLiveSessionRollingSummary,
  collectStudioLiveLongSessionDiagnostics,
  evaluateStudioLiveAutoDegrade,
  serializeStudioLiveDiagnosticsJson,
} from "./studio-live-long-session-diagnostics";
import { useStudioLiveViewportPreferences } from "./studio-live-viewport-preferences";
import { useStudioMobileKeyboardOffset } from "./use-studio-mobile-keyboard-offset";
import { creatorSub2StatusText } from "../status-i18n/studio-creator-sub2-status-i18n-r3c13b";

import type {
  StudioLiveAttentionRequest,
  StudioLivePeer,
  StudioLiveRoom,
} from "./studio-live-collaboration-room";

export interface StudioLiveQuickCollaborationControlsProps {
  room: StudioLiveRoom;
  peers: readonly StudioLivePeer[];
  followingSessionId: string | null;
  onToggleFollow: (sessionId: string) => void;
  lastLocalCommitAt?: number | null;
}

function canDirectAttention(room: StudioLiveRoom): boolean {
  return (
    room.participant.role === "owner" ||
    room.participant.role === "admin" ||
    room.participant.role === "editor"
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.closest('[role="textbox"]') !== null)
  );
}

function formatClockTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function StudioLiveQuickCollaborationControls({
  room,
  peers,
  followingSessionId,
  onToggleFollow,
  lastLocalCommitAt = null,
}: StudioLiveQuickCollaborationControlsProps) {
  const preferences = useStudioLiveViewportPreferences();
  const inputRef = useRef<HTMLInputElement>(null);
  const attentionTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const sawDisconnectRef = useRef(false);
  const rollingSummaryRef = useRef<StudioLiveSessionRollingSummary | null>(null);
  if (rollingSummaryRef.current === null) {
    rollingSummaryRef.current = new StudioLiveSessionRollingSummary();
  }
  const lastLocalCommitRef = useRef<number | null>(lastLocalCommitAt);
  const [composerOpen, setComposerOpen] = useState(false);
  const keyboardOffsetPx = useStudioMobileKeyboardOffset(composerOpen);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryBadge, setRecoveryBadge] = useState<string | null>(null);
  const [attention, setAttention] = useState<StudioLiveAttentionRequest | null>(null);
  const canChat = room.participant.role !== "viewer";
  const canSpotlight = canDirectAttention(room) && peers.length > 0;
  const roomReady = room.ready;

  useEffect(() => {
    if (typeof lastLocalCommitAt === "number" && Number.isFinite(lastLocalCommitAt)) {
      lastLocalCommitRef.current = lastLocalCommitAt;
    }
  }, [lastLocalCommitAt]);

  const autoDegrade = useMemo(
    () =>
      evaluateStudioLiveAutoDegrade({
        peerCount: peers.length,
        userTrailsPreference: preferences.showTrails,
      }),
    [peers.length, preferences.showTrails],
  );

  const announce = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) {
      globalThis.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = globalThis.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 3_000);
  };

  const openComposer = useCallback(() => {
    setComposerOpen(true);
    globalThis.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  useEffect(() => {
    const unsubscribe = room.subscribe((event) => {
      if (event.type === "transport-status") {
        if (event.status.state === "disconnected" || event.status.state === "connecting") {
          sawDisconnectRef.current = true;
          return;
        }
        if (event.status.state === "ready" && sawDisconnectRef.current) {
          sawDisconnectRef.current = false;
          const syncedAt = Date.now();
          rollingSummaryRef.current?.recordReconnect(syncedAt);
          const localCommitLabel =
            lastLocalCommitRef.current !== null
              ? ` · 로컬 저장 ${formatClockTime(lastLocalCommitRef.current)}`
              : "";
          setRecoveryBadge(
            `동기화 복구됨 · 유실 0획${localCommitLabel} · 동기화 ${formatClockTime(syncedAt)}`,
          );
          if (recoveryTimerRef.current !== null) {
            globalThis.clearTimeout(recoveryTimerRef.current);
          }
          recoveryTimerRef.current = globalThis.setTimeout(() => {
            setRecoveryBadge(null);
            recoveryTimerRef.current = null;
          }, 5_000);
        }
        return;
      }
      if (
        event.type !== "attention" ||
        event.request.participant.sessionId === room.participant.sessionId
      ) return;
      if (attentionTimerRef.current !== null) {
        globalThis.clearTimeout(attentionTimerRef.current);
      }
      setAttention(event.request);
      attentionTimerRef.current = globalThis.setTimeout(() => {
        setAttention((current) =>
          current?.requestId === event.request.requestId ? null : current
        );
        attentionTimerRef.current = null;
      }, Math.max(0, event.request.expiresAt - Date.now()));
    });
    return () => {
      unsubscribe();
      if (attentionTimerRef.current !== null) {
        globalThis.clearTimeout(attentionTimerRef.current);
        attentionTimerRef.current = null;
      }
    };
  }, [room]);

  useEffect(() => {
    if (
      attention &&
      !peers.some((peer) => peer.sessionId === attention.participant.sessionId)
    ) {
      setAttention(null);
    }
  }, [attention, peers]);

  useEffect(() => {
    if (!canChat || !roomReady || typeof document === "undefined") return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) return;
      event.preventDefault();
      openComposer();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canChat, openComposer, roomReady]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) {
      globalThis.clearTimeout(noticeTimerRef.current);
    }
    if (recoveryTimerRef.current !== null) {
      globalThis.clearTimeout(recoveryTimerRef.current);
    }
  }, []);

  const copyDiagnosticsReport = useCallback(() => {
    const snapshot = collectStudioLiveLongSessionDiagnostics({
      activeInkStrokes: room.getActiveInkStrokeCount(),
      recovering: recoveryBadge !== null,
      autoDegradedTrails: autoDegrade.degraded,
    });
    rollingSummaryRef.current?.recordHeapSample(snapshot.heapUsedMb, snapshot.capturedAt);
    const rolling = rollingSummaryRef.current?.snapshot(snapshot.capturedAt);
    const json = rolling
      ? JSON.stringify({ ...snapshot, rollingSummary: rolling }, null, 2)
      : serializeStudioLiveDiagnosticsJson(snapshot);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(json).then(
        () => announce("장시간 협업 진단 리포트를 복사했습니다."),
        () => announce("진단 리포트를 복사하지 못했습니다."),
      );
      return;
    }
    announce("진단 리포트를 준비했습니다.");
  }, [autoDegrade.degraded, recoveryBadge, room]);

  const submitCursorChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (!room.sendCursorChat(text)) {
      announce(creatorSub2StatusText("studio.creatorSub2.status.live.quick.cursorChatFailed", "커서 메시지를 보내지 못했습니다."));
      return;
    }
    setDraft("");
    setComposerOpen(false);
    announce("커서 메시지를 보냈습니다.");
  };

  const acceptAttention = () => {
    if (!attention) return;
    if (followingSessionId !== attention.participant.sessionId) {
      onToggleFollow(attention.participant.sessionId);
    }
    announce(`${attention.participant.displayName} 작업 위치를 따라갑니다.`);
    setAttention(null);
  };

  return (
    <>
      <span aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {notice}
      </span>

      {recoveryBadge ? (
        <div
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line/60 bg-card/85 px-3 text-xs font-medium tabular-nums text-fg-2"
          data-studio-live-recovery-hud="true"
          role="status"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-good" aria-hidden />
          <span>{recoveryBadge}</span>
        </div>
      ) : null}

      {autoDegrade.degraded ? (
        <div
          className={recoveryBadge
            ? "hidden h-9 shrink-0 items-center gap-2 rounded-lg border border-line/60 bg-card/85 px-3 text-[11px] font-medium tabular-nums text-fg-2 sm:flex"
            : "flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line/60 bg-card/85 px-3 text-[11px] font-medium tabular-nums text-fg-2"}
          data-studio-live-auto-degrade-hud="true"
          role="status"
          title="동시 접속 인원이 많아 원격 획 트레일을 일시적으로 단순화했습니다."
        >
          <Gauge size={14} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <span>트레일 자동 절감 · {peers.length.toLocaleString("ko-KR")}명</span>
        </div>
      ) : null}

      {attention ? (
        <div
          className="order-last flex min-h-11 basis-full items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 sm:basis-auto"
          data-studio-live-attention-request={attention.requestId}
        >
          <LocateFixed className="shrink-0 text-accent" size={14} strokeWidth={1.5} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
            {attention.participant.displayName} 위치 초대
          </span>
          <button
            className="min-h-8 shrink-0 rounded-md bg-accent px-3 text-[11px] font-medium text-on-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            type="button"
            onClick={acceptAttention}
          >
            따라가기
          </button>
          <button
            aria-label="작업 위치 초대 닫기"
            className="grid size-8 shrink-0 place-items-center rounded-md text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
            type="button"
            onClick={() => setAttention(null)}
          >
            <X size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ) : null}

      {composerOpen ? (
        <form
          className="order-last flex min-h-11 min-w-0 basis-full items-center gap-2 rounded-lg border border-accent/40 bg-card p-1 sm:basis-auto"
          data-studio-live-cursor-chat-composer="true"
          style={keyboardOffsetPx > 0 ? { marginBottom: `${keyboardOffsetPx}px` } : undefined}
          onSubmit={submitCursorChat}
        >
          <label className="sr-only" htmlFor="studio-live-cursor-chat-input">
            커서 메시지
          </label>
          <input
            ref={inputRef}
            autoComplete="off"
            className="min-h-9 min-w-0 flex-1 rounded-md bg-transparent px-2 text-xs text-fg placeholder:text-fg-3 focus-visible:outline-none sm:w-44"
            id="studio-live-cursor-chat-input"
            maxLength={STUDIO_LIVE_CURSOR_CHAT_MAX_LENGTH}
            placeholder="커서 옆에 잠깐 표시"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              setComposerOpen(false);
              setDraft("");
            }}
          />
          <button
            aria-label="커서 메시지 보내기"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-on-accent transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            disabled={!draft.trim()}
            type="submit"
          >
            <SendHorizontal size={14} strokeWidth={1.5} aria-hidden />
          </button>
          <button
            aria-label="커서 메시지 취소"
            className="grid size-9 shrink-0 place-items-center rounded-md text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
            type="button"
            onClick={() => {
              setComposerOpen(false);
              setDraft("");
            }}
          >
            <X size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </form>
      ) : canChat ? (
        <button
          aria-keyshortcuts="/"
          aria-label="커서 메시지 입력, 단축키 슬래시"
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line/60 bg-card/80 text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 motion-reduce:transition-none"
          data-studio-live-cursor-chat-action="true"
          disabled={!roomReady}
          title="커서 메시지 · /"
          type="button"
          onClick={openComposer}
        >
          <MessageCircle size={15} strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}

      {canSpotlight ? (
        <button
          aria-label="모든 팀원에게 현재 작업 위치 초대 보내기"
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-accent/40 bg-accent-soft text-accent transition-colors duration-150 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
          data-studio-live-attention-action="true"
          title="모두 내 위치로 초대"
          type="button"
          onClick={() => {
            announce(
              room.requestAttention()
                ? "팀원에게 현재 작업 위치 초대를 보냈습니다."
                : creatorSub2StatusText("studio.creatorSub2.status.live.quick.attentionFailed", "현재 페이지 초대를 보내지 못했습니다.")
            );
          }}
        >
          <LocateFixed size={15} strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}

      <button
        aria-label="장시간 협업 진단 리포트 JSON 복사"
        className="grid size-11 shrink-0 place-items-center rounded-lg border border-line/60 bg-card/80 text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
        data-studio-live-diagnostics-dump-action="true"
        title="진단 JSON 복사"
        type="button"
        onClick={copyDiagnosticsReport}
      >
        <Activity size={15} strokeWidth={1.5} aria-hidden />
      </button>
    </>
  );
}
